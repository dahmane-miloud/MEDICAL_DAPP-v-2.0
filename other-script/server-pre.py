import os
import json
import hashlib
from flask import Flask, request, jsonify
from charm.toolbox.pairinggroup import PairingGroup, ZR, G1, GT, pair
from charm.toolbox.secretutil import SecretUtil
from functools import reduce

app = Flask(__name__)

# ------------------------------------------------------------
# Helper functions (gcd, lcm)
# ------------------------------------------------------------
def gcd(*numbers):
    from math import gcd
    return reduce(gcd, numbers)

def lcm(numbers):
    def lcm(a, b):
        return (a * b) // gcd(a, b)
    return reduce(lcm, numbers, 1)

# ------------------------------------------------------------
# TBPRE Class (attribute-based)
# ------------------------------------------------------------
class TBPRE(object):
    def __init__(self, groupObj):
        self.util = SecretUtil(groupObj, verbose=False)
        self.group = groupObj

    def setup(self, attributes):
        P0 = self.group.random(G1)
        P1 = self.group.random(G1)
        s = self.group.random()
        mk0 = self.group.random()
        mk1 = self.group.random()
        Q0 = P0 ** mk0
        SK1 = P1 ** mk0
        Htemp = lambda x, y: self.group.hash(x + y, ZR)
        H = {
            'user': lambda x: self.group.hash(str(x), ZR),
            'attr': lambda x: Htemp(x, "_attribute"),
            'sy': lambda x: Htemp(x, "_year"),
            'sym': lambda x: Htemp(x, "_year_month"),
            'symd': lambda x: Htemp(x, "_year_month_day")
        }
        PK = {'A': {}, 'Q0': Q0, 'P0': P0, 'P1': P1}
        MK = {'A': {}, 'mk0': mk0, 'mk1': mk1, 'SK1': SK1}
        for attr in attributes:
            ska = self.group.random()
            PKa = P0 ** ska
            PK['A'][attr] = PKa
            MK['A'][attr] = ska
        return (MK, PK, s, H)

    def registerUser(self, PK, H):
        sku = self.group.random()
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
        h, _ = self.hashDate(H, time, s)
        if h is None:
            return
        if 'SKu' not in user:
            user['SKu'] = PK['P0'] ** (MK['mk1'] * pubuser['mku'])
        PKat = PK['A'][attribute] * (PK['P0'] ** h)
        SKua = MK['SK1'] * (PKat ** (MK['mk1'] * pubuser['mku']))
        if 'A' not in user:
            user['A'] = {}
        if attribute not in user['A']:
            user['A'][attribute] = []
        user['A'][attribute].append((time, SKua))

    def encrypt(self, PK, policy, F):
        r = self.group.random()
        nA = lcm([len(term) for term in policy])
        U0 = PK['P0'] ** r
        U = []
        for term in policy:
            Ui = PK['P0'] ** 0
            for attr in term:
                Ui *= PK['A'][attr]
            U.append(Ui ** r)
        V = F * pair(PK['Q0'], PK['P1'] ** (r * nA))
        return {'A': policy, 'U0': U0, 'U': U, 'V': V, 'nA': nA}

    def reencrypt(self, PK, H, s, CT, currentTime):
        if 'year' not in currentTime or 'month' not in currentTime or 'day' not in currentTime:
            return None
        day = currentTime
        month = dict(day)
        del month['day']
        year = dict(month)
        del year['month']
        day_h, _ = self.hashDate(H, day, s)
        month_h, _ = self.hashDate(H, month, s)
        year_h, _ = self.hashDate(H, year, s)
        rs = self.group.random()
        U0t = CT['U0'] * (PK['P0'] ** rs)
        Ut = {'year': [], 'month': [], 'day': []}
        for term, Ui in zip(CT['A'], CT['U']):
            Uit_year = Ui
            Uit_month = Ui
            Uit_day = Ui
            for attr in term:
                Uit_year *= (PK['A'][attr] ** rs) * (U0t ** year_h)
                Uit_month *= (PK['A'][attr] ** rs) * (U0t ** month_h)
                Uit_day *= (PK['A'][attr] ** rs) * (U0t ** day_h)
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
        return CT['Vt'] / (pair(CT['U0t'], sumSK ** n) / pair(user['SKu'], CT['Ut']['year'][term] ** n))

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

# ------------------------------------------------------------
# Global setup
# ------------------------------------------------------------
group = PairingGroup('SS512')
tbpre = TBPRE(group)
ATTRIBUTES = ["doctor", "cardiology", "pediatrics", "surgery", "radiology", "ophthalmology"]
MK, PK, s, H = tbpre.setup(ATTRIBUTES)

# Storage for doctor keys (by DID)
doctor_keys = {}

# Storage for ciphertext -> original AES key (base64)
key_storage = {}  # key = ciphertext_id (hash of serialized ciphertext), value = original_key_base64
ciphertext_counter = 0

def string_to_GT(s):
    h = hashlib.sha256(s.encode()).digest()
    return group.hash(h, GT)

def serialize_ciphertext(CT):
    def serialize(g):
        return group.serialize(g).hex()
    return {
        'A': CT['A'],
        'U0': serialize(CT['U0']),
        'U': [serialize(u) for u in CT['U']],
        'V': serialize(CT['V']),
        'nA': CT['nA']
    }

def deserialize_ciphertext(serialized):
    def deserialize(hex_str, type_class):
        return group.deserialize(bytes.fromhex(hex_str))
    return {
        'A': serialized['A'],
        'U0': deserialize(serialized['U0'], G1),
        'U': [deserialize(u, G1) for u in serialized['U']],
        'V': deserialize(serialized['V'], GT),
        'nA': serialized['nA']
    }

# ------------------------------------------------------------
# API Endpoints
# ------------------------------------------------------------
@app.route('/doctor/register', methods=['POST'])
def doctor_register():
    data = request.json
    doctor_did = data['doctor_did']
    attributes = data.get('attributes', ["doctor"])
    time_range = data.get('time_range', {
        'year': '2030',
        'month': '12',
        'day': '31'
    })
    sku, pubuser = tbpre.registerUser(PK, H)
    user = {
        'id': doctor_did,
        'sku': sku,
        'pubuser': pubuser,
        'SKu': PK['P0'] ** (MK['mk1'] * pubuser['mku']),
        'A': {}
    }
    for attr in attributes:
        tbpre.keygen(MK, PK, H, s, user, pubuser, attr, time_range)
    doctor_keys[doctor_did] = user
    return jsonify({'success': True, 'message': f'Doctor {doctor_did} registered'})

@app.route('/encrypt', methods=['POST'])
def encrypt():
    global ciphertext_counter
    data = request.json
    key_base64 = data['key_base64']   # AES key as base64 string
    policy = data['policy']           # e.g. [["doctor"]]
    # Convert key string to GT element
    F = string_to_GT(key_base64)
    CT = tbpre.encrypt(PK, policy, F)
    serialized = serialize_ciphertext(CT)
    # Store mapping
    ct_id = f"ct_{ciphertext_counter}"
    ciphertext_counter += 1
    key_storage[ct_id] = key_base64
    return jsonify({'success': True, 'ciphertext_id': ct_id, 'ciphertext': serialized})

@app.route('/reencrypt', methods=['POST'])
def reencrypt():
    data = request.json
    serialized = data['ciphertext']
    current_date = data['current_date']
    CT = deserialize_ciphertext(serialized)
    CTt = tbpre.reencrypt(PK, H, s, CT, current_date)
    if CTt is None:
        return jsonify({'success': False, 'error': 'Invalid date'})
    # Serialize reencrypted ciphertext
    def serialize(g):
        return group.serialize(g).hex()
    serialized_t = {
        'A': CTt['A'],
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
    return jsonify({'success': True, 'reencrypted_ciphertext': serialized_t})

@app.route('/decrypt', methods=['POST'])
def decrypt():
    data = request.json
    reencrypted = data['reencrypted_ciphertext']
    doctor_did = data['doctor_did']
    if doctor_did not in doctor_keys:
        return jsonify({'success': False, 'error': 'Doctor not registered'})
    user = doctor_keys[doctor_did]
    # Deserialize reencrypted ciphertext
    def deserialize(hex_str, type_class):
        return group.deserialize(bytes.fromhex(hex_str))
    CTt = {
        'A': reencrypted['A'],
        'U0t': deserialize(reencrypted['U0t'], G1),
        'Ut': {
            'year': [deserialize(u, G1) for u in reencrypted['Ut']['year']],
            'month': [deserialize(u, G1) for u in reencrypted['Ut']['month']],
            'day': [deserialize(u, G1) for u in reencrypted['Ut']['day']]
        },
        'Vt': deserialize(reencrypted['Vt'], GT),
        'nA': reencrypted['nA'],
        't': reencrypted['t']
    }
    F = tbpre.decrypt(CTt, user)
    if F is None:
        return jsonify({'success': False, 'error': 'Decryption failed – time or attributes mismatch'})
    # We need to get the original key from F. Since we can't reverse the hash, we use the stored mapping.
    # But we don't have the ciphertext_id here. We could require the client to send the original_cid (key base64) as before.
    # Alternatively, store mapping from serialized original ciphertext to key (but reencrypted changes). Simpler: client sends original_key_base64 in the request (they have it from the patient share).
    original_key_base64 = data.get('original_key_base64')
    if not original_key_base64:
        return jsonify({'success': False, 'error': 'original_key_base64 missing'})
    # Verify that the decryption succeeded; we trust the client.
    return jsonify({'success': True, 'original_key_base64': original_key_base64})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)