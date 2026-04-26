document.addEventListener('DOMContentLoaded', function() {
    const typeCards = document.querySelectorAll('.type-card');
    const doctorFields = document.querySelectorAll('.doctor-fields');
    const healthFields = document.querySelectorAll('.health-fields');
    const signupForm = document.getElementById('signupForm');

    let selectedType = 'patient';

    // Type selection
    for (let i = 0; i < typeCards.length; i++) {
        const card = typeCards[i];
        card.addEventListener('click', function(e) {
            const clickedCard = e.currentTarget;
            
            // Remove active class from all cards
            for (let j = 0; j < typeCards.length; j++) {
                typeCards[j].classList.remove('active');
            }
            
            clickedCard.classList.add('active');
            selectedType = clickedCard.dataset.type;

            // Show/hide appropriate fields
            for (let k = 0; k < doctorFields.length; k++) {
                doctorFields[k].style.display = selectedType === 'doctor' ? 'block' : 'none';
            }
            
            for (let k = 0; k < healthFields.length; k++) {
                healthFields[k].style.display = selectedType === 'health' ? 'block' : 'none';
            }
        });
    }

    // Handle signup
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validate form
        const fullNameInput = document.getElementById('fullName');
        //const emailInput = document.getElementById('email');
        /*
        if (!fullNameInput || !emailInput) {
            showToast('Form elements not found', 'error');
            return;
        }
            */
        
        const fullName = fullNameInput.value.trim();
        //const email = emailInput.value.trim();

        if (!fullName) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        const formData = {
            name: fullName,
           // email: email,
            type: selectedType
        };

        if (selectedType === 'doctor') {
            const licenseInput = document.getElementById('license');
            const specializationInput = document.getElementById('specialization');
            
            if (!licenseInput || !specializationInput) {
                showToast('Doctor fields not found', 'error');
                return;
            }
            
            const license = licenseInput.value.trim();
            const specialization = specializationInput.value.trim();

            if (!license || !specialization) {
                showToast('Please fill in all doctor fields', 'error');
                return;
            }

            formData.license = license;
            formData.specialization = specialization;
        } else if (selectedType === 'health') {
            const departmentInput = document.getElementById('department');
            
            if (!departmentInput) {
                showToast('Department field not found', 'error');
                return;
            }
            
            const department = departmentInput.value.trim();
            if (!department) {
                showToast('Please fill in department', 'error');
                return;
            }
            formData.department = department;
        }

        showLoading('Creating your account...');

        try {
            console.log('Sending signup request with data:', formData);
            
            // Vérifier que electronAPI est disponible
            if (!window.electronAPI || typeof window.electronAPI.signup !== 'function') {
                throw new Error('Electron API not available');
            }
            
            const result = await window.electronAPI.signup(formData);
            console.log('Signup result:', result);

            if (result && result.success === true) {
                if (result.user) {
                    showCredentials(result.user);
                }
                showToast('Account created successfully!', 'success');
            } else {
                const errorMsg = (result && result.error) ? result.error : 'Signup failed';
                console.error('Signup failed:', errorMsg);
                showToast(errorMsg, 'error');
            }
        } catch (error) {
            console.error('Signup error:', error);
            showToast('An error occurred: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    });
});

// Global functions
function showCredentials(user) {
    const modal = document.getElementById('credentialsModal');
    if (!modal) {
        console.error('Credentials modal not found');
        return;
    }

    const didDisplay = document.getElementById('displayDid');
    const publicKeyDisplay = document.getElementById('displayPublicKey');
    const privateKeyDisplay = document.getElementById('displayPrivateKey');

    if (didDisplay) didDisplay.textContent = user.did || 'N/A';
    if (publicKeyDisplay) publicKeyDisplay.textContent = user.publicKey || 'N/A';
    if (privateKeyDisplay) privateKeyDisplay.textContent = user.privateKey || 'N/A';
    
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
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showToast('Copied to clipboard!', 'success');
        }).catch(function(err) {
            console.error('Copy failed:', err);
            fallbackCopy(text);
        });
    } else {
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

function downloadCredentials() {
    const didDisplay = document.getElementById('displayDid');
    const publicKeyDisplay = document.getElementById('displayPublicKey');
    const privateKeyDisplay = document.getElementById('displayPrivateKey');
    
    if (!didDisplay || !publicKeyDisplay || !privateKeyDisplay) {
        showToast('Credential elements not found', 'error');
        return;
    }
    
    const credentials = {
        did: didDisplay.textContent,
        publicKey: publicKeyDisplay.textContent,
        privateKey: privateKeyDisplay.textContent,
        exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(credentials, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ssi-credentials.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Credentials downloaded!', 'success');
}

function proceedToLogin() {
    window.location.href = 'login.html';
}

// Toast notification function (identique à celle de login.js)
function showToast(message, type) {
    if (!type) type = 'info';
    
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = 'toast ' + type;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';

    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(function() {
        if (toast && toast.parentNode) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(function() {
                if (toast && toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }, 3000);
}

function showLoading(message) {
    if (!message) message = 'Creating your SSI identity...';
    
    let loadingOverlay = document.querySelector('.loading-overlay');
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.id = 'signup-loading';
        loadingOverlay.innerHTML = '<div class="spinner"></div><p class="loading-message"></p>';
        document.body.appendChild(loadingOverlay);
    }
    
    const messageEl = loadingOverlay.querySelector('.loading-message');
    if (messageEl) messageEl.textContent = message;
    
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    const loadingOverlay = document.getElementById('signup-loading');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add necessary CSS styles dynamically
(function addToastStyles() {
    if (document.getElementById('toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        .toast-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
        }

        .toast {
            background: white;
            color: #333;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
            min-width: 300px;
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
            display: none;
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

        .loading-overlay p {
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

        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
})();