const mcl = require('mcl-wasm');

class TBPRE {
    constructor() {
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        await mcl.init(mcl.BLS12_381);
        this.group = mcl;
        this.initialized = true;
    }

    // ---------- Helper functions ----------
    _hashToFr(str) {
        const fr = new this.group.Fr();
        fr.setHashOf(str);
        return fr;
    }

    _serializeG1(g) {
        return g.serializeToHexStr();
    }

    _deserializeG1(hex) {
        const g = new this.group.G1();
        g.deserializeHexStr(hex);
        return g;
    }

    _serializeGT(gt) {
        return gt.serializeToHexStr();
    }

    _deserializeGT(hex) {
        const gt = new this.group.GT();
        gt.deserializeHexStr(hex);
        return gt;
    }

    // ---------- Setup (called once at app start) ----------
    setup(attributes) {
        const P0 = this.group.hashAndMapToG1('P0');
        const P1 = this.group.hashAndMapToG1('P1');
        const s = this._hashToFr('s_secret');
        const mk0 = this._hashToFr('mk0');
        const mk1 = this._hashToFr('mk1');

        const Q0 = this.group.mul(P0, mk0);
        const SK1 = this.group.mul(P1, mk0);

        const H = {
            user: (x) => this._hashToFr(x),
            attr: (x) => this._hashToFr(x + '_attribute'),
            sy: (x) => this._hashToFr(x + '_year'),
            sym: (x) => this._hashToFr(x + '_year_month'),
            symd: (x) => this._hashToFr(x + '_year_month_day')
        };

        const PK = { A: {}, Q0, P0, P1 };
        const MK = { A: {}, mk0, mk1, SK1 };

        for (let attr of attributes) {
            const ska = this._hashToFr(attr);
            const PKa = this.group.mul(P0, ska);
            PK.A[attr] = PKa;
            MK.A[attr] = ska;
        }

        this.PK = PK;
        this.MK = MK;
        this.s = s;
        this.H = H;
        return { PK, MK, s, H };
    }

    // ---------- User registration (for doctors) ----------
    registerUser(PK, H) {
        const sku = this._hashToFr('sku_' + Math.random());
        const PKu = this.group.mul(PK.P0, sku);
        const mku = H.user(PKu.serializeToHexStr());
        return { sku, public: { PKu, mku } };
    }

    // ---------- Date hashing ----------
    hashDate(H, time, s) {
        let h = new this.group.Fr().setStr(s.getStr());
        let key = 'y';
        if (!time.year) return null;
        h = this.group.mul(H.sy(time.year), h);
        if (time.month) {
            h = this.group.mul(H.sym(time.month), h);
            key = 'ym';
            if (time.day) {
                h = this.group.mul(H.symd(time.day), h);
                key = 'ymd';
            }
        } else if (time.day) return null;
        return { h, key };
    }

    // ---------- Key generation for a doctor (by CA) ----------
    keygen(MK, PK, H, s, user, pubuser, attribute, time) {
        const hashRes = this.hashDate(H, time, s);
        if (!hashRes) return;
        const h = hashRes.h;
        if (!user.SKu) {
            user.SKu = this.group.mul(PK.P0, this.group.mul(MK.mk1, pubuser.mku));
        }
        const PKat = this.group.add(PK.A[attribute], this.group.mul(PK.P0, h));
        const SKua = this.group.mul(MK.SK1, this.group.mul(PKat, this.group.mul(MK.mk1, pubuser.mku)));
        if (!user.A) user.A = {};
        if (!user.A[attribute]) user.A[attribute] = [];
        user.A[attribute].push({ time, SKua });
    }

    // ---------- Encryption (by patient) ----------
    encrypt(PK, policy, F) {
        const r = this._hashToFr('r_' + Math.random());
        const nA = this._lcm(policy.map(term => term.length));
        const U0 = this.group.mul(PK.P0, r);
        const U = [];
        for (let term of policy) {
            let Ui = new this.group.G1();
            Ui.setInt(0);
            for (let attr of term) {
                Ui = this.group.add(Ui, PK.A[attr]);
            }
            Ui = this.group.mul(Ui, r);
            U.push(Ui);
        }
        const e = this.group.pairing(this.group.mul(PK.P1, this.group.mul(r, nA)), PK.Q0);
        const V = this.group.add(F, e);
        return { A: policy, U0, U, V, nA };
    }

    // ---------- Re‑encryption (by proxy) ----------
    reencrypt(PK, H, s, CT, currentTime) {
        const day = { year: currentTime.year, month: currentTime.month, day: currentTime.day };
        const month = { year: currentTime.year, month: currentTime.month };
        const year = { year: currentTime.year };
        const dayHash = this.hashDate(H, day, s);
        const monthHash = this.hashDate(H, month, s);
        const yearHash = this.hashDate(H, year, s);
        if (!dayHash || !monthHash || !yearHash) return null;

        const rs = this._hashToFr('rs_' + Math.random());
        const U0t = this.group.add(CT.U0, this.group.mul(PK.P0, rs));
        const Ut = { year: [], month: [], day: [] };
        for (let i = 0; i < CT.A.length; i++) {
            const term = CT.A[i];
            let sumPKA = new this.group.G1();
            sumPKA.setInt(0);
            for (let attr of term) {
                sumPKA = this.group.add(sumPKA, PK.A[attr]);
            }
            const termMul = this.group.mul(sumPKA, rs);
            const Uit_year = this.group.add(this.group.add(CT.U[i], termMul), this.group.mul(CT.U0, yearHash.h));
            const Uit_month = this.group.add(this.group.add(CT.U[i], termMul), this.group.mul(CT.U0, monthHash.h));
            const Uit_day = this.group.add(this.group.add(CT.U[i], termMul), this.group.mul(CT.U0, dayHash.h));
            Ut.year.push(Uit_year);
            Ut.month.push(Uit_month);
            Ut.day.push(Uit_day);
        }
        const Vt = this.group.add(CT.V, this.group.pairing(this.group.mul(PK.P1, this.group.mul(rs, CT.nA)), PK.Q0));
        return { A: CT.A, U0t, Ut, Vt, nA: CT.nA, t: currentTime };
    }

    // ---------- Decryption (by doctor) ----------
    decrypt(CT, user) {
        // Find first policy term satisfied by user's attributes
        let termIdx = -1;
        for (let i = 0; i < CT.A.length; i++) {
            const term = CT.A[i];
            let ok = true;
            for (let attr of term) {
                if (!user.A[attr]) { ok = false; break; }
            }
            if (ok) { termIdx = i; break; }
        }
        if (termIdx === -1) return null;

        let sumSK = new this.group.G1();
        sumSK.setInt(0);
        for (let attr of CT.A[termIdx]) {
            let found = false;
            for (let key of user.A[attr]) {
                if (this._timeSuffices(key.time, CT.t)) {
                    sumSK = this.group.add(sumSK, key.SKua);
                    found = true;
                    break;
                }
            }
            if (!found) return null;
        }
        const n = CT.nA / CT.A[termIdx].length;
        const e1 = this.group.pairing(CT.U0t, this.group.mul(sumSK, new this.group.Fr().setInt(n)));
        const e2 = this.group.pairing(user.SKu, CT.Ut.year[termIdx]);
        const divisor = this.group.div(e1, e2);
        return this.group.sub(CT.Vt, divisor);
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

    _lcm(numbers) {
        const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
        const lcm2 = (a, b) => (a * b) / gcd(a, b);
        return numbers.reduce(lcm2, 1);
    }

    // ---------- Utility: map a string (e.g., CID) to a GT element ----------
    stringToGT(str) {
        const hash = this._hashToFr(str);
        const gen = this.group.pairing(this.group.hashAndMapToG1('gen1'), this.group.hashAndMapToG2('gen2'));
        return this.group.pow(gen, hash);
    }

    // ---------- Serialization helpers for external use ----------
    serializeCiphertext(CT) {
        return {
            A: CT.A,
            U0: this._serializeG1(CT.U0),
            U: CT.U.map(u => this._serializeG1(u)),
            V: this._serializeGT(CT.V),
            nA: CT.nA
        };
    }

    deserializeCiphertext(obj) {
        return {
            A: obj.A,
            U0: this._deserializeG1(obj.U0),
            U: obj.U.map(hex => this._deserializeG1(hex)),
            V: this._deserializeGT(obj.V),
            nA: obj.nA
        };
    }

    serializeReencrypted(CTt) {
        return {
            A: CTt.A,
            U0t: this._serializeG1(CTt.U0t),
            Ut: {
                year: CTt.Ut.year.map(g => this._serializeG1(g)),
                month: CTt.Ut.month.map(g => this._serializeG1(g)),
                day: CTt.Ut.day.map(g => this._serializeG1(g))
            },
            Vt: this._serializeGT(CTt.Vt),
            nA: CTt.nA,
            t: CTt.t
        };
    }

    deserializeReencrypted(obj) {
        return {
            A: obj.A,
            U0t: this._deserializeG1(obj.U0t),
            Ut: {
                year: obj.Ut.year.map(hex => this._deserializeG1(hex)),
                month: obj.Ut.month.map(hex => this._deserializeG1(hex)),
                day: obj.Ut.day.map(hex => this._deserializeG1(hex))
            },
            Vt: this._deserializeGT(obj.Vt),
            nA: obj.nA,
            t: obj.t
        };
    }
}

module.exports = TBPRE;