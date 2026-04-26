document.addEventListener('DOMContentLoaded', function() {
    // Check if already logged in
    checkExistingSession();

    // DOM Elements
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginFormElement = document.getElementById('loginFormElement');
    const signupFormElement = document.getElementById('signupFormElement');
    const showSignup = document.getElementById('showSignup');
    const showLogin = document.getElementById('showLogin');
    const typeBtns = document.querySelectorAll('.type-btn');
    const doctorFields = document.querySelectorAll('.doctor-field');

    let currentUserType = 'patient';

    // Check if elements exist
    if (!loginFormElement || !signupFormElement) {
        console.error('Required form elements not found');
        return;
    }

    // User type selection
    for (let i = 0; i < typeBtns.length; i++) {
        const btn = typeBtns[i];
        btn.addEventListener('click', function(e) {
            const clickedBtn = e.currentTarget;
            
            // Remove active class from all buttons
            for (let j = 0; j < typeBtns.length; j++) {
                typeBtns[j].classList.remove('active');
            }
            
            clickedBtn.classList.add('active');
            currentUserType = clickedBtn.dataset.type;

            // Show/hide doctor fields
            for (let k = 0; k < doctorFields.length; k++) {
                const field = doctorFields[k];
                if (field) {
                    field.style.display = currentUserType === 'doctor' ? 'block' : 'none';
                }
            }
        });
    }

    // Toggle between login and signup
    if (showSignup) {
        showSignup.addEventListener('click', function(e) {
            e.preventDefault();
            if (loginForm && signupForm) {
                loginForm.style.display = 'none';
                signupForm.style.display = 'block';
            }
        });
    }

    if (showLogin) {
        showLogin.addEventListener('click', function(e) {
            e.preventDefault();
            if (signupForm && loginForm) {
                signupForm.style.display = 'none';
                loginForm.style.display = 'block';
            }
        });
    }

    // Handle login
    loginFormElement.addEventListener('submit', async function(e) {
        e.preventDefault();

        const didInput = document.getElementById('did');
        const privateKeyInput = document.getElementById('privateKey');

        if (!didInput || !privateKeyInput) {
            showToast('Login form inputs not found', 'error');
            return;
        }

        const did = didInput.value.trim();
        const privateKey = privateKeyInput.value.trim();

        if (!did || !privateKey) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        // Validation basique du format DID
        if (!did.startsWith('did:')) {
            showToast('Invalid DID format. Should start with "did:"', 'error');
            return;
        }

        showLoading('Logging in...');

        try {
            console.log('Attempting login for DID:', did);
            console.log('Private key length:', privateKey.length);
            
            // Vérifier que electronAPI est disponible
            if (!window.electronAPI || typeof window.electronAPI.login !== 'function') {
                throw new Error('Electron API not available');
            }
            
            const result = await window.electronAPI.login({ 
                did: did, 
                privateKey: privateKey 
            });
            
            console.log('Login result:', result);

            if (result && result.success === true) {
                showToast('Login successful!', 'success');

                // Store session data if needed
                if (result.user) {
                    try {
                        localStorage.setItem('userType', result.user.type);
                        localStorage.setItem('userDid', result.user.did);
                    } catch (storageError) {
                        console.warn('Could not save to localStorage:', storageError);
                    }
                }

                // Redirect based on user type
                setTimeout(function() {
                    if (result.user && result.user.type) {
                        redirectToDashboard(result.user.type);
                    } else {
                        window.location.href = 'login.html';
                    }
                }, 1000);
            } else {
                const errorMsg = (result && result.error) ? result.error : 'Login failed';
                console.error('Login failed:', errorMsg);
                showToast(errorMsg, 'error');
                
                // Clear the private key field for security
                privateKeyInput.value = '';
            }
        } catch (error) {
            console.error('Login error details:', error);
            showToast('Login error: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    });

    // Handle signup
    signupFormElement.addEventListener('submit', async function(e) {
        e.preventDefault();

        const nameInput = document.getElementById('fullName');
       // const emailInput = document.getElementById('email');
        const licenseInput = document.getElementById('license');
        const specializationInput = document.getElementById('specialization');

        if (!nameInput) {
            showToast('Required fields not found', 'error');
            return;
        }

        const name = nameInput.value.trim();
        //const email = emailInput.value.trim();

        if (!name) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        // Safely get license and specialization values
        let license = '';
        let specialization = '';

        if (licenseInput) {
            license = licenseInput.value.trim();
        }

        if (specializationInput) {
            specialization = specializationInput.value.trim();
        }

        showLoading('Creating your account...');

        try {
            const signupData = {
                name: name,
                //
                // email: email,
                type: currentUserType
            };

            if (currentUserType === 'doctor') {
                if (!license || !specialization) {
                    showToast('Please fill in all doctor fields', 'error');
                    hideLoading();
                    return;
                }
                signupData.license = license;
                signupData.specialization = specialization;
            }

            console.log('Sending signup data:', signupData);
            
            // Vérifier que electronAPI est disponible
            if (!window.electronAPI || typeof window.electronAPI.signup !== 'function') {
                throw new Error('Electron API not available');
            }
            
            const result = await window.electronAPI.signup(signupData);
            console.log('Signup result:', result);

            if (result && result.success === true) {
                // Show credentials
                if (result.user) {
                    showCredentials(result.user);
                }

                // Auto-fill login form
                const didInput = document.getElementById('did');
                const privateKeyInput = document.getElementById('privateKey');

                if (didInput && result.user && result.user.did) {
                    didInput.value = result.user.did;
                }
                if (privateKeyInput && result.user && result.user.privateKey) {
                    privateKeyInput.value = result.user.privateKey;
                }

                // Switch to login view
                if (signupForm && loginForm) {
                    signupForm.style.display = 'none';
                    loginForm.style.display = 'block';
                }

                showToast('Account created successfully! Please save your credentials.', 'success');
            } else {
                const errorMsg = (result && result.error) ? result.error : 'Signup failed';
                console.error('Signup failed:', errorMsg);
                showToast(errorMsg, 'error');
            }
        } catch (error) {
            console.error('Signup error details:', error);
            showToast('Signup error: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    });

    async function checkExistingSession() {
        try {
            if (!window.electronAPI || typeof window.electronAPI.getSession !== 'function') {
                console.warn('getSession function not available');
                return;
            }
            
            const session = await window.electronAPI.getSession();
            if (session && session.type) {
                console.log('Existing session found, redirecting to:', session.type);
                redirectToDashboard(session.type);
            }
        } catch (error) {
            console.error('Error checking session:', error);
        }
    }

    function redirectToDashboard(userType) {
        console.log('Redirecting to dashboard for:', userType);
        
        let dashboardUrl = 'login.html';
        if (userType === 'patient') {
            dashboardUrl = 'patient/dashboard.html';
        } else if (userType === 'doctor') {
            dashboardUrl = 'doctor/dashboard.html';
        } else if (userType === 'health') {
            dashboardUrl = 'health-dept/dashboard.html';
        }
        
        console.log('Redirecting to:', dashboardUrl);
        window.location.href = dashboardUrl;
    }
});

// Global functions
function showCredentials(user) {
    const modal = document.getElementById('credentialsModal');
    const didDisplay = document.getElementById('displayDid');
    const publicKeyDisplay = document.getElementById('displayPublicKey');
    const privateKeyDisplay = document.getElementById('displayPrivateKey');

    if (!modal || !didDisplay || !publicKeyDisplay || !privateKeyDisplay) {
        console.error('Credential modal elements not found');
        showToast('Error displaying credentials', 'error');
        return;
    }

    didDisplay.textContent = user.did || 'N/A';
    publicKeyDisplay.textContent = user.publicKey || 'N/A';
    privateKeyDisplay.textContent = user.privateKey || 'N/A';
    
    // Afficher aussi l'adresse Ethereum si disponible
    if (user.ethAddress) {
        const ethDisplay = document.getElementById('displayEthAddress');
        if (ethDisplay) {
            ethDisplay.textContent = user.ethAddress;
        }
    }
    
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('credentialsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        showToast('Element not found', 'error');
        return;
    }

    const text = element.textContent;
    
    // Utiliser l'API Clipboard moderne avec fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showToast('Copied to clipboard!', 'success');
        }).catch(function(err) {
            console.error('Copy failed:', err);
            // Fallback
            fallbackCopy(text);
        });
    } else {
        // Fallback pour les anciens navigateurs
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        showToast('Copied to clipboard!', 'success');
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showToast('Failed to copy', 'error');
    }
    
    document.body.removeChild(textarea);
}

function showLoading(message) {
    if (!message) message = 'Loading...';
    
    // Remove any existing overlay
    hideLoading();

    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'global-loading';
    overlay.innerHTML = `
        <div class="spinner"></div>
        <p class="loading-message">${escapeHtml(message)}</p>
    `;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('global-loading');
    if (overlay) {
        overlay.remove();
    }
}

function showToast(message, type) {
    if (!type) type = 'info';
    
    // Remove any existing toasts if too many
    const existingToasts = document.querySelectorAll('.toast');
    if (existingToasts.length > 5) {
        existingToasts[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast ' + type;

    // Determine icon
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';

    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    document.body.appendChild(toast);

    // Remove toast after 3 seconds
    setTimeout(function() {
        if (toast && toast.parentNode) {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(function() {
                if (toast && toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add CSS for animations if not already present
(function addToastStyles() {
    if (document.getElementById('toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            background: white;
            color: #333;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            max-width: 400px;
        }

        .toast.success {
            background: #d4edda;
            color: #155724;
            border-left: 4px solid #28a745;
        }

        .toast.error {
            background: #f8d7da;
            color: #721c24;
            border-left: 4px solid #dc3545;
        }

        .toast.warning {
            background: #fff3cd;
            color: #856404;
            border-left: 4px solid #ffc107;
        }

        .toast.info {
            background: #d1ecf1;
            color: #0c5460;
            border-left: 4px solid #17a2b8;
        }

        .toast i {
            font-size: 1.2rem;
        }

        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            z-index: 9999;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid #f3f3f3;
            border-top: 5px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }

        .loading-message {
            color: #333;
            font-size: 1.1rem;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes fadeOut {
            from {
                opacity: 1;
            }
            to {
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
})();