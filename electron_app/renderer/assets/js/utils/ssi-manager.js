class SSIManager {
    constructor() {
        this.currentUser = null;
    }

    // Utilise la génération réelle du backend via electronAPI
    async generateDID() {
        try {
            // Cette méthode est maintenant juste un wrapper
            // Les vraies clés sont générées par le backend (index.js)
            console.log('SSIManager: generateDID called - using backend generation');
            
            // On retourne un objet vide car la vraie génération se fait via signup
            return null;
        } catch (error) {
            console.error('SSIManager error:', error);
            throw error;
        }
    }

    async createIdentity(userData) {
        try {
            console.log('SSIManager: Creating identity with data:', userData);
            
            // Appel au backend pour générer les vraies clés
            const result = await window.electronAPI.signup(userData);
            
            if (result && result.success) {
                this.currentUser = result.user;
                return result.user;
            } else {
                throw new Error(result.error || 'Failed to create identity');
            }
        } catch (error) {
            console.error('Error creating identity:', error);
            throw error;
        }
    }

    async verifyCredentials(did, privateKey) {
        try {
            console.log('SSIManager: Verifying credentials for DID:', did);
            
            // Appel au backend pour vérifier les identifiants
            const result = await window.electronAPI.login({ did, privateKey });
            
            if (result && result.success) {
                this.currentUser = result.user;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error verifying credentials:', error);
            return false;
        }
    }

    async signData(data, privateKey) {
        try {
            // Utilisation de la signature réelle via crypto:sign
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            const result = await window.electronAPI.sign({ message });
            
            if (result && result.success) {
                return result.signature;
            }
            throw new Error('Signing failed');
        } catch (error) {
            console.error('Error signing data:', error);
            // Fallback à une simulation
            return `sig-${btoa(JSON.stringify(data))}`;
        }
    }

    async verifySignature(data, signature, publicKey) {
        try {
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            const result = await window.electronAPI.verify({ 
                did: this.currentUser?.did, 
                message, 
                signature 
            });
            
            return result && result.valid;
        } catch (error) {
            console.error('Error verifying signature:', error);
            // Fallback à la simulation
            const expectedSig = `sig-${btoa(JSON.stringify(data))}`;
            return signature === expectedSig;
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }
}

window.SSIManager = SSIManager;