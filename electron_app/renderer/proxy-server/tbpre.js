const mcl = require('mcl-wasm');

class TBPRE {
    constructor() {
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        await mcl.init(mcl.BLS12_381);
        this.initialized = true;
    }

    _hashToFr(str) {
        const fr = new mcl.Fr();
        fr.setHashOf(str);
        return fr;
    }

    _hashToG1(str) {
        return mcl.hashAndMapToG1(str);
    }

    _hashToG2(str) {
        return mcl.hashAndMapToG2(str);
    }

    _serializeG1(g) { return g.serializeToHexStr(); }
    _deserializeG1(hex) { const g = new mcl.G1(); g.deserializeHexStr(hex); return g; }
    _serializeGT(gt) { return gt.serializeToHexStr(); }
    _deserializeGT(hex) { const gt = new mcl.GT(); gt.deserializeHexStr(hex); return gt; }

    setup(attributes) {
        const P0 = this._hashToG1('P0');
        const P1 = this._hashToG1('P1');
        const s = this._hashToFr('s');
        const mk0 = this._hashToFr('mk0');
        const mk1 = this._hashToFr('mk1');
        const Q0 = mcl.mul(P0, mk0);
        const SK1 = mcl.mul(P1, mk0);
        const PK = { A: {}, Q0, P0, P1 };
        const MK = { A: {}, mk0, mk1, SK1 };
        for (let attr of attributes) {
            const ska = this._hashToFr(attr);
            const PKa = mcl.mul(P0, ska);
            PK.A[attr] = PKa;
            MK.A[attr] = ska;
        }
        const H = {
            user: (x) => this._hashToFr(x),
            attr: (x) => this._hashToFr(x + '_attr'),
            sy: (x) => this._hashToFr(x + '_year'),
            sym: (x) => this._hashToFr(x + '_month'),
            symd: (x) => this._hashToFr(x + '_day')
        };
        return { PK, MK, s, H };
    }

    registerUser(PK, H) {
        const sku = this._hashToFr('sku_' + Math.random());
        const PKu = mcl.mul(PK.P0, sku);
        const mku = H.user(PKu.serializeToHexStr());
        return { sku, public: { PKu, mku } };
    }

    hashDate(H, time, s) {
        let h = s;
        if (!time.year) return null;
        h = mcl.add(h, H.sy(time.year));
        if (time.month) {
            h = mcl.add(h, H.sym(time.month));
            if (time.day) h = mcl.add(h, H.symd(time.day));
        }
        return h;
    }

    keygen(MK, PK, H, s, user, pubuser, attribute, time) {
        const h = this.hashDate(H, time, s);
        if (!h) return;
        if (!user.SKu) user.SKu = mcl.mul(PK.P0, mcl.mul(MK.mk1, pubuser.mku));
        const PKat = mcl.add(PK.A[attribute], mcl.mul(PK.P0, h));
        const SKua = mcl.mul(MK.SK1, mcl.mul(PKat, mcl.mul(MK.mk1, pubuser.mku)));
        if (!user.A) user.A = {};
        if (!user.A[attribute]) user.A[attribute] = [];
        user.A[attribute].push({ time, SKua });
    }

    encrypt(PK, policy, F) {
        const r = this._hashToFr('r_' + Math.random());
        const U0 = mcl.mul(PK.P0, r);
        const U = [];
        for (let term of policy) {
            let sum = new mcl.G1(); sum.setInt(0);
            for (let attr of term) sum = mcl.add(sum, PK.A[attr]);
            U.push(mcl.mul(sum, r));
        }
        const e = mcl.pairing(mcl.mul(PK.P1, r), PK.Q0);
        const V = mcl.add(F, e);
        return { policy, U0, U, V, nA: 1 };
    }

    reencrypt(PK, H, s, CT, currentTime) {
        const h = this.hashDate(H, currentTime, s);
        if (!h) return null;
        const rs = this._hashToFr('rs_' + Math.random());
        const U0t = mcl.add(CT.U0, mcl.mul(PK.P0, rs));
        const Ut = [];
        for (let i = 0; i < CT.U.length; i++) {
            const Ui = mcl.add(CT.U[i], mcl.mul(CT.U0, rs));
            Ut.push(Ui);
        }
        const Vt = mcl.add(CT.V, mcl.pairing(mcl.mul(PK.P1, rs), PK.Q0));
        return { policy: CT.policy, U0t, Ut, Vt, nA: CT.nA, t: currentTime };
    }

    decrypt(CT, user) {
        // Find first policy term satisfied by user's attributes
        let termIdx = -1;
        for (let i = 0; i < CT.policy.length; i++) {
            let ok = true;
            for (let attr of CT.policy[i]) {
                if (!user.A[attr]) { ok = false; break; }
            }
            if (ok) { termIdx = i; break; }
        }
        if (termIdx === -1) return null;

        let sumSK = new mcl.G1(); sumSK.setInt(0);
        for (let attr of CT.policy[termIdx]) {
            let found = false;
            for (let k of user.A[attr]) {
                if (this._timeSuffices(k.time, CT.t)) {
                    sumSK = mcl.add(sumSK, k.SKua);
                    found = true;
                    break;
                }
            }
            if (!found) return null;
        }
        const n = CT.nA / CT.policy[termIdx].length;
        const e1 = mcl.pairing(CT.U0t, mcl.mul(sumSK, new mcl.Fr().setInt(n)));
        const e2 = mcl.pairing(user.SKu, CT.Ut[termIdx]);
        const divisor = mcl.div(e1, e2);
        return mcl.sub(CT.Vt, divisor);
    }

    _timeSuffices(timeRange, needle) {
        if (timeRange.year !== needle.year) return false;
        if (!timeRange.month) return true;
        if (!needle.month) return false;
        if (timeRange.month !== needle.month) return false;
        if (!timeRange.day) return true;
        if (!needle.day) return false;
        return timeRange.day === needle.day;
    }

    stringToGT(str) {
        const hash = this._hashToFr(str);
        const gen = mcl.pairing(this._hashToG1('gen'), this._hashToG2('gen'));
        return mcl.pow(gen, hash);
    }

    gtToString(gt) {
        // For a real implementation, you would need a reversible mapping.
        // In this demo, we return a placeholder; in practice you'd store the CID in a DB.
        return 'cid_' + Math.random().toString(36).substring(2, 15);
    }

    serializeCiphertext(CT) {
        return {
            policy: CT.policy,
            U0: this._serializeG1(CT.U0),
            U: CT.U.map(u => this._serializeG1(u)),
            V: this._serializeGT(CT.V),
            nA: CT.nA
        };
    }

    deserializeCiphertext(obj) {
        return {
            policy: obj.policy,
            U0: this._deserializeG1(obj.U0),
            U: obj.U.map(hex => this._deserializeG1(hex)),
            V: this._deserializeGT(obj.V),
            nA: obj.nA
        };
    }
}

module.exports = TBPRE;