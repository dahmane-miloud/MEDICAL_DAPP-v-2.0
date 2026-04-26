// proxy-manager.js
class ProxyManager {
    constructor() {
        this.baseUrl = 'http://localhost:5000';
    }

    async setup() {
        const res = await fetch(`${this.baseUrl}/setup`);
        return res.json();
    }

    async registerUser(userId, attributes) {
        const res = await fetch(`${this.baseUrl}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, attributes })
        });
        return res.json();
    }

    async assignAttribute(userId, attribute, timeRange) {
        const res = await fetch(`${this.baseUrl}/assign_attribute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, attribute, time_range: timeRange })
        });
        return res.json();
    }

    async encryptCid(cid, policy, timeSlot) {
        const res = await fetch(`${this.baseUrl}/encrypt_cid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cid, policy, time_slot: timeSlot })
        });
        return res.json();
    }

    async generateRekey(ctId, delegateeAttrs, delegateeTimeWindow) {
        const res = await fetch(`${this.baseUrl}/generate_rekey`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ct_id: ctId, delegatee_attrs: delegateeAttrs, delegatee_time_window: delegateeTimeWindow })
        });
        return res.json();
    }

    async proxyReencrypt(rekeyId) {
        const res = await fetch(`${this.baseUrl}/proxy_reencrypt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rekey_id: rekeyId })
        });
        return res.json();
    }

    async decrypt(transformedCtId, userId) {
        const res = await fetch(`${this.baseUrl}/decrypt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transformed_ct_id: transformedCtId, user_id: userId })
        });
        return res.json();
    }
}
window.ProxyManager = ProxyManager;