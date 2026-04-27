#!/usr/bin/env python3
# tpre-server.py – Full TB-PRE Proxy Server with charm-crypto

import os
import json
import time
import hashlib
import traceback
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# ------------------------------------------------------------
# 1. Try to import charm-crypto (graceful fallback)
# ------------------------------------------------------------
try:
    from charm.toolbox.pairinggroup import PairingGroup, ZR, G1, GT, pair
    from charm.toolbox.secretutil import SecretUtil
    from functools import reduce
    CHARM_AVAILABLE = True
    print("✅ charm-crypto loaded successfully")
except ImportError:
    CHARM_AVAILABLE = False
    print("⚠️ charm-crypto not available – falling back to simple storage")
    class PairingGroup: pass
    ZR = G1 = GT = None
    def pair(a,b): return None

app = Flask(__name__)
CORS(app)

# ------------------------------------------------------------
# 2. Global storage
# ------------------------------------------------------------
ciphertext_store = {}
doctor_keys = {}
rekey_store = {}
transformed_store = {}
aes_key_mapping = {}

def get_current_date():
    now = datetime.now()
    return {'year': str(now.year), 'month': str(now.month), 'day': str(now.day)}

# ------------------------------------------------------------
# 3. TB-PRE class (only if charm is available)
# ------------------------------------------------------------
if CHARM_AVAILABLE:
    def gcd(*numbers):
        from math import gcd
        return reduce(gcd, numbers)

    def lcm(numbers):
        from functools import reduce
        def lcm(a,b):
            return (a * b) // gcd(a,b)
        return reduce(lcm, numbers, 1)

    class TBPRE(object):
        def __init__(self, groupObj):
            self.util = SecretUtil(groupObj, verbose=False)
            self.group = groupObj

        def setup(self, attributes):
            P0 = self.group.random(G1)
            P1 = self.group.random(G1)
            s = self.group.random(ZR)
            mk0 = self.group.random(ZR)
            mk1 = self.group.random(ZR)
            Q0 = P0 ** mk0
            SK1 = P1 ** mk0
            def Htemp(x, y):
                xb = x.encode() if isinstance(x,str) else str(x).encode()
                yb = y.encode() if isinstance(y,str) else str(y).encode()
                return self.group.hash(xb + yb, ZR)
            H = {
                'user': lambda x: self.group.hash(str(x).encode(), ZR),
                'attr': lambda x: Htemp(x, "_attribute"),
                'sy':   lambda x: Htemp(x, "_year"),
                'sym':  lambda x: Htemp(x, "_year_month"),
                'symd': lambda x: Htemp(x, "_year_month_day")
            }
            PK = {'A': {}, 'Q0': Q0, 'P0': P0, 'P1': P1}
            MK = {'A': {}, 'mk0': mk0, 'mk1': mk1, 'SK1': SK1}
            for attr in attributes:
                ska = self.group.random(ZR)
                PKa = P0 ** ska
                PK['A'][attr] = PKa
                MK['A'][attr] = ska
            return (MK, PK, s, H)

        def registerUser(self, PK, H):
            sku = self.group.random(ZR)
            PKu = PK['P0'] ** sku
            mku = H['user'](PKu)
            return (sku, {'PKu': PKu, 'mku': mku})

        def hashDate(self, H, time, s):
            h = s
            key = 'y'
            if "year" in time:
                h = H['sy'](time['year']) ** h
            else:
                return None, None
            if "month" in time:
                h = H['sym'](time['month']) ** h
                key = 'ym'
                if "day" in time:
                    h = H['symd'](time['day']) ** h
                    key = 'ymd'
            elif "day" in time:
                return None, None
            return h, key

        def timeSuffices(self, timeRange, needle):
            if timeRange['year'] != needle['year']:
                return False
            if 'month' not in timeRange:
                return True
            if 'month' not in needle:
                return False
            if timeRange['month'] != needle['month']:
                return False
            if 'day' not in timeRange:
                return True
            if 'day' not in needle:
                return False
            return timeRange['day'] == needle['day']

        def keygen(self, MK, PK, H, s, user, pubuser, attribute, time):
            h,_ = self.hashDate(H, time, s)
            if h is None:
                return None
            if 'SKu' not in user:
                user['SKu'] = PK['P0'] ** (MK['mk1'] * pubuser['mku'])
            PKat = PK['A'][attribute] * (PK['P0'] ** h)
            SKua = MK['SK1'] * (PKat ** (MK['mk1'] * pubuser['mku']))
            if 'A' not in user:
                user['A'] = {}
            if attribute not in user['A']:
                user['A'][attribute] = []
            user['A'][attribute].append((time, SKua))
            return SKua

        def encrypt(self, PK, policy, M):
            r = self.group.random(ZR)
            nA = lcm([len(term) for term in policy])
            U0 = PK['P0'] ** r
            U = []
            for term in policy:
                Ui = PK['P0'] ** 0
                for attr in term:
                    Ui *= PK['A'][attr]
                U.append(Ui ** r)
            V = M * pair(PK['Q0'], PK['P1'] ** (r * nA))
            return {'A': policy, 'U0': U0, 'U': U, 'V': V, 'nA': nA}

        def reencrypt(self, PK, H, s, CT, currentTime):
            if 'year' not in currentTime or 'month' not in currentTime or 'day' not in currentTime:
                return None
            day = currentTime
            month = dict(day)
            del month['day']
            year = dict(month)
            del year['month']
            day_h,_ = self.hashDate(H, day, s)
            month_h,_ = self.hashDate(H, month, s)
            year_h,_ = self.hashDate(H, year, s)
            rs = self.group.random(ZR)
            U0t = CT['U0'] * (PK['P0'] ** rs)
            Ut = {'year':[], 'month':[], 'day':[]}
            for term, Ui in zip(CT['A'], CT['U']):
                Uit_year = Ui
                Uit_month = Ui
                Uit_day = Ui
                for attr in term:
                    Uit_year  *= (PK['A'][attr] ** rs) * (U0t ** year_h)
                    Uit_month *= (PK['A'][attr] ** rs) * (U0t ** month_h)
                    Uit_day   *= (PK['A'][attr] ** rs) * (U0t ** day_h)
                Ut['year'].append(Uit_year)
                Ut['month'].append(Uit_month)
                Ut['day'].append(Uit_day)
            Vt = CT['V'] * pair(PK['Q0'], PK['P1'] ** (rs * CT['nA']))
            return {'A': CT['A'], 'U0t': U0t, 'Ut': Ut, 'Vt': Vt, 'nA': CT['nA'], 't': currentTime}

        def decrypt(self, CT, user, term=None):
            if term is None:
                term = self.policyTerm(user, CT['A'])
                if term is False:
                    return None
            sumSK = 1
            for attr in CT['A'][term]:
                found = False
                for timeRange, SKua in user['A'][attr]:
                    if self.timeSuffices(timeRange, CT['t']):
                        sumSK *= SKua
                        found = True
                        break
                if not found:
                    return None
            n = CT['nA'] // len(CT['A'][term])
            res = CT['Vt'] / (pair(CT['U0t'], sumSK ** n) / pair(user['SKu'], CT['Ut']['year'][term] ** n))
            return res

        def policyTerm(self, user, policy):
            userAttrs = list(user['A'].keys())
            for i, term in enumerate(policy):
                ok = True
                for attr in term:
                    if attr not in userAttrs:
                        ok = False
                        break
                if ok:
                    return i
            return False

    # Global TB-PRE setup
    print("Initializing TB-PRE system...")
    group = PairingGroup('SS512')
    tbpre = TBPRE(group)
    ATTRIBUTES = ["doctor","cardiologist","neurologist","pediatrician",
                  "surgeon","dermatologist","ophthalmologist","psychiatrist",
                  "radiologist","oncologist","gynecologist","urologist"]
    MK, PK, s, H = tbpre.setup(ATTRIBUTES)
    print(f"✅ TB-PRE ready with {len(ATTRIBUTES)} attributes")
    G_GT = group.random(GT)

    def serialize(g):
        return group.serialize(g).hex()

    def deserialize(hex_str, typ):
        return group.deserialize(bytes.fromhex(hex_str))

else:
    def serialize(x): return x
    def deserialize(x,t): return x

# ------------------------------------------------------------
# 4. API Endpoints
# ------------------------------------------------------------
@app.route('/health', methods=['GET','OPTIONS'])
def health():
    if request.method == 'OPTIONS':
        return '',200
    return jsonify({
        'status':'ok',
        'charm_available': CHARM_AVAILABLE,
        'doctors': len(doctor_keys),
        'ciphertexts': len(ciphertext_store)
    })

@app.route('/register_doctor', methods=['POST','OPTIONS'])
def register_doctor():
    if request.method == 'OPTIONS':
        return '',200
    try:
        data = request.json
        doctor_did = data.get('doctor_did')
        attrs = data.get('attributes', ['doctor'])
        if not doctor_did:
            return jsonify({'error':'Doctor DID required'}),400

        # Ensure doctor has at least "doctor" attribute
        if "doctor" not in attrs:
            attrs.append("doctor")
        
        # Store basic info
        doctor_keys[doctor_did] = {'id':doctor_did, 'attributes':attrs, 'registered_at':int(time.time())}

        if CHARM_AVAILABLE:
            sku, pubuser = tbpre.registerUser(PK, H)
            user = {
                'id': doctor_did,
                'sku': sku,
                'pubuser': pubuser,
                'SKu': PK['P0'] ** (MK['mk1'] * pubuser['mku']),
                'A': {}
            }
            current_date = get_current_date()
            for attr in attrs:
                if attr in ATTRIBUTES:
                    tbpre.keygen(MK, PK, H, s, user, pubuser, attr, current_date)
            doctor_keys[doctor_did]['crypto_user'] = user

        print(f"✅ Doctor registered: {doctor_did}, attributes: {attrs}")
        return jsonify({'success':True, 'message':'Doctor registered', 'attributes':attrs})
    except Exception as e:
        print(f"❌ Register error: {e}")
        return jsonify({'error':str(e)}),500

@app.route('/encrypt_aes', methods=['POST','OPTIONS'])
def encrypt_aes():
    if request.method == 'OPTIONS':
        return '',200
    try:
        data = request.json
        aes_key_b64 = data.get('aes_key_b64')
        policy = data.get('policy', [['doctor']])
        time_slot = data.get('time_slot', int(time.time()/3600))

        if not aes_key_b64:
            return jsonify({'error':'No AES key'}),400

        ciphertext_id = f"ct_{time_slot}_{int(time.time())}_{os.urandom(4).hex()}"
        aes_key_mapping[ciphertext_id] = aes_key_b64

        if CHARM_AVAILABLE:
            dummy = group.random(GT)
            CT = tbpre.encrypt(PK, policy, dummy)
            serialized = {
                'ciphertext_id': ciphertext_id,
                'policy': CT['A'],
                'U0': serialize(CT['U0']),
                'U': [serialize(u) for u in CT['U']],
                'V': serialize(CT['V']),
                'nA': CT['nA'],
                'created_at': int(time.time())
            }
            ciphertext_store[ciphertext_id] = serialized
        else:
            ciphertext_store[ciphertext_id] = {
                'ciphertext_id': ciphertext_id,
                'encrypted_key': aes_key_b64,
                'policy': policy,
                'created_at': int(time.time())
            }

        print(f"✅ Ciphertext stored: {ciphertext_id} with policy: {policy}")
        return jsonify({'success':True, 'ciphertext_id':ciphertext_id, 'ciphertext':ciphertext_store[ciphertext_id]})
    except Exception as e:
        print(f"❌ Encrypt error: {e}")
        traceback.print_exc()
        return jsonify({'error':str(e)}),500

@app.route('/generate_rekey', methods=['POST','OPTIONS'])
def generate_rekey():
    if request.method == 'OPTIONS':
        return '',200
    try:
        data = request.json or {}
        ct_id = data.get('ct_id')
        delegatee_did = data.get('delegatee_did')
        delegatee_attrs = data.get('delegatee_attrs', ['doctor'])

        print(f"\n--- REKEY REQUEST ---")
        print(f"ct_id: {ct_id}")
        print(f"delegatee_did: {delegatee_did}")

        if not ct_id:
            return jsonify({'error': 'Missing ct_id'}), 400
            
        if ct_id not in ciphertext_store:
            return jsonify({'error': f'Ciphertext {ct_id} not found'}), 404
            
        if not delegatee_did:
            return jsonify({'error': 'Missing delegatee_did'}), 400
            
        if delegatee_did not in doctor_keys:
            return jsonify({'error': 'Delegatee doctor not registered'}), 404

        rekey_id = f"rekey_{ct_id}_{int(time.time())}_{os.urandom(4).hex()}"
        rekey_store[rekey_id] = {
            'ct_id': ct_id,
            'delegatee_did': delegatee_did,
            'delegatee_attrs': delegatee_attrs,
            'created_at': int(time.time())
        }
        print(f"✅ Rekey generated: {rekey_id}")
        return jsonify({'success':True, 'rekey_id':rekey_id})
    except Exception as e:
        print(f"❌ generate_rekey error: {e}")
        return jsonify({'error':str(e)}),500

@app.route('/proxy_reencrypt', methods=['POST','OPTIONS'])
def proxy_reencrypt():
    if request.method == 'OPTIONS':
        return '',200
    try:
        data = request.json
        rekey_id = data.get('rekey_id')
        if not rekey_id or rekey_id not in rekey_store:
            return jsonify({'error':'Rekey not found'}),404

        info = rekey_store[rekey_id]
        ct_id = info['ct_id']
        ct_data = ciphertext_store[ct_id]

        if CHARM_AVAILABLE:
            CT = {
                'A': ct_data['policy'],
                'U0': deserialize(ct_data['U0'], G1),
                'U': [deserialize(u, G1) for u in ct_data['U']],
                'V': deserialize(ct_data['V'], GT),
                'nA': ct_data['nA']
            }
            current_date = get_current_date()
            CTt = tbpre.reencrypt(PK, H, s, CT, current_date)
            if CTt is None:
                return jsonify({'error':'Re-encryption failed (invalid date)'}),400
            transformed_id = f"transformed_{ct_id}_{int(time.time())}_{os.urandom(4).hex()}"
            transformed_store[transformed_id] = {
                'transformed_id': transformed_id,
                'original_ct_id': ct_id,
                'delegatee_did': info['delegatee_did'],
                'policy': CTt['A'],
                'U0t': serialize(CTt['U0t']),
                'Ut': {
                    'year': [serialize(u) for u in CTt['Ut']['year']],
                    'month': [serialize(u) for u in CTt['Ut']['month']],
                    'day': [serialize(u) for u in CTt['Ut']['day']]
                },
                'Vt': serialize(CTt['Vt']),
                'nA': CTt['nA'],
                't': CTt['t']
            }
        else:
            transformed_id = f"transformed_{ct_id}_{int(time.time())}_{os.urandom(4).hex()}"
            transformed_store[transformed_id] = {
                'transformed_id': transformed_id,
                'original_ct_id': ct_id,
                'delegatee_did': info['delegatee_did'],
                'encrypted_key': ct_data.get('encrypted_key')
            }

        print(f"✅ Proxy re-encrypted: {transformed_id}")
        return jsonify({'success':True, 'transformed_ct_id':transformed_id})
    except Exception as e:
        print(f"❌ proxy_reencrypt error: {e}")
        return jsonify({'error':str(e)}),500

@app.route('/decrypt_aes', methods=['POST','OPTIONS'])
def decrypt_aes():
    if request.method == 'OPTIONS':
        return '',200
    try:
        data = request.json
        transformed_id = data.get('transformed_ct_id')
        doctor_did = data.get('doctor_did')

        if not transformed_id or transformed_id not in transformed_store:
            return jsonify({'error':'Transformed ciphertext not found'}),404
        if not doctor_did or doctor_did not in doctor_keys:
            return jsonify({'error':'Doctor not registered'}),400

        trans = transformed_store[transformed_id]
        if trans.get('delegatee_did') != doctor_did:
            return jsonify({'error':'Not authorized'}),403

        if CHARM_AVAILABLE:
            user = doctor_keys[doctor_did]['crypto_user']
            CTt = {
                'A': trans['policy'],
                'U0t': deserialize(trans['U0t'], G1),
                'Ut': {
                    'year': [deserialize(u, G1) for u in trans['Ut']['year']],
                    'month': [deserialize(u, G1) for u in trans['Ut']['month']],
                    'day': [deserialize(u, G1) for u in trans['Ut']['day']]
                },
                'Vt': deserialize(trans['Vt'], GT),
                'nA': trans['nA'],
                't': trans['t']
            }
            result = tbpre.decrypt(CTt, user)
            if result is None:
                return jsonify({'error':'Decryption failed - attribute mismatch'}),403

        original_id = trans.get('original_ct_id')
        aes_key = aes_key_mapping.get(original_id)
        if not aes_key:
            aes_key = trans.get('encrypted_key')
        if not aes_key:
            return jsonify({'error':'AES key not found'}),404

        print(f"✅ Decryption successful for: {doctor_did}")
        return jsonify({'success':True, 'aes_key_b64':aes_key})
    except Exception as e:
        print(f"❌ decrypt error: {e}")
        return jsonify({'error':str(e)}),500

@app.route('/get_doctor_status', methods=['GET','POST','OPTIONS'])
def get_doctor_status():
    if request.method == 'OPTIONS':
        return '',200
    try:
        if request.method == 'GET':
            did = request.args.get('doctor_did')
        else:
            did = request.json.get('doctor_did') if request.json else None
        if not did:
            return jsonify({'error':'Doctor DID required'}),400
        reg = did in doctor_keys
        attrs = doctor_keys[did].get('attributes',[]) if reg else []
        return jsonify({'success':True, 'is_registered':reg, 'doctor_did':did, 'attributes':attrs})
    except Exception as e:
        return jsonify({'error':str(e)}),500

@app.route('/test', methods=['GET'])
def test():
    return jsonify({
        'charm': CHARM_AVAILABLE,
        'ciphertexts': list(ciphertext_store.keys()),
        'doctors': list(doctor_keys.keys()),
        'rekeys': list(rekey_store.keys()),
        'transformed': list(transformed_store.keys())
    })

if __name__ == '__main__':
    print("="*70)
    print("🚀 TB-PRE Proxy Server with charm-crypto")
    print("="*70)
    print("📡 Health:           POST /health")
    print("🔐 Encrypt AES:      POST /encrypt_aes")
    print("🔄 Generate rekey:   POST /generate_rekey")
    print("🔁 Proxy re-encrypt: POST /proxy_reencrypt")
    print("🔓 Decrypt AES:      POST /decrypt_aes")
    print("📝 Register doctor:  POST /register_doctor")
    print("🧪 Test:             GET  /test")
    print("="*70)
    if CHARM_AVAILABLE:
        print("✅ Running with FULL charm-crypto")
    else:
        print("⚠️ Running in SIMPLE mode")
    print("="*70)
    app.run(host='0.0.0.0', port=5000, debug=True)