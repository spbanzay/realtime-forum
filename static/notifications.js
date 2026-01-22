// Modern Inline Notifications System
class NotificationManager {
    constructor() {
        this.createToastContainer();
        this.currentToasts = [];
    }

    createToastContainer() {
        if (!document.querySelector('.toast-container')) {
            const container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    }

    showToast(message, type = 'info', duration = 5000) {
        const container = document.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        toast.innerHTML = `
            <span class="notification-icon"></span>
            <span class="notification-content">${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
        `;

        container.appendChild(toast);
        this.currentToasts.push(toast);

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toast);
            }, duration);
        }

        return toast;
    }

    removeToast(toast) {
        if (toast && toast.parentElement) {
            toast.classList.add('removing');
            setTimeout(() => {
                toast.remove();
                this.currentToasts = this.currentToasts.filter(t => t !== toast);
            }, 300);
        }
    }

    success(message, duration = 5000) {
        return this.showToast(message, 'success', duration);
    }

    error(message, duration = 7000) {
        return this.showToast(message, 'error', duration);
    }

    warning(message, duration = 6000) {
        return this.showToast(message, 'warning', duration);
    }

    info(message, duration = 5000) {
        return this.showToast(message, 'info', duration);
    }

    clear() {
        this.currentToasts.forEach(toast => this.removeToast(toast));
    }
}

// Create global instance
window.notify = new NotificationManager();

// Helper functions for common notifications
window.showSuccess = (message) => window.notify.success(message);
window.showError = (message) => window.notify.error(message);
window.showWarning = (message) => window.notify.warning(message);
window.showInfo = (message) => window.notify.info(message);

// Enhanced form validation with inline messages
class FormValidator {
    constructor() {
        this.init();
    }

    init() {
        // Отложенная инициализация для динамически создаваемых форм
        this.bindExistingForms();
        
        // Отслеживаем добавление новых форм
        const observer = new MutationObserver(() => {
            this.bindExistingForms();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    bindExistingForms() {
        // Remove HTML5 validation and add custom validation
        document.querySelectorAll('form').forEach(form => {
            if (form.dataset.validatorBound) return; // Не привязываем повторно
            form.dataset.validatorBound = 'true';
            
            form.noValidate = true;
            form.addEventListener('submit', this.handleSubmit.bind(this));
        });

        // Real-time validation
        document.querySelectorAll('input, textarea, select').forEach(field => {
            if (field.dataset.validatorBound) return; // Не привязываем повторно
            field.dataset.validatorBound = 'true';
            
            field.addEventListener('blur', this.validateField.bind(this));
            field.addEventListener('input', this.clearFieldError.bind(this));
        });
    }

    handleSubmit(event) {
        const form = event.target;
        let isValid = true;

        // Validate all fields
        form.querySelectorAll('input[required], textarea[required], select[required]').forEach(field => {
            if (!this.validateField({ target: field })) {
                isValid = false;
            }
        });

        // Custom validations
        if (form.id === 'createPostForm') {
            const categories = form.querySelectorAll('input[name="categories"]:checked');
            if (categories.length === 0) {
                this.showFieldError(form.querySelector('.category-selection'), 'Please select at least one category for your post.');
                isValid = false;
            }
        }

        if (!isValid) {
            event.preventDefault();
            showError('Please fix the errors below before submitting.');
        }
    }

    validateField(event) {
        const field = event.target;
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';

        // Clear previous errors
        this.clearFieldError(event);

        // Required field validation
        if (field.hasAttribute('required') && !value) {
            errorMessage = `${this.getFieldLabel(field)} is required.`;
            isValid = false;
        }

        // Type-specific validations
        if (value && field.type === 'email') {
            const emailRegex = /^[a-zA-Z0-9._-]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                errorMessage = 'Please enter a valid email address using only English letters, numbers, dots, underscores, and hyphens before @ symbol.';
                isValid = false;
            }
            // Проверяем часть до @
            const localPart = value.split('@')[0];
            if (localPart && !/^[a-zA-Z0-9._-]+$/.test(localPart)) {
                errorMessage = 'Email address before @ can only contain English letters, numbers, dots, underscores, and hyphens.';
                isValid = false;
            }
        }

        // Length validations
        if (value) {
            const minLength = field.getAttribute('minlength');
            const maxLength = field.getAttribute('maxlength');
            
            if (minLength && value.length < parseInt(minLength)) {
                errorMessage = `${this.getFieldLabel(field)} must be at least ${minLength} characters long.`;
                isValid = false;
            }
            
            if (maxLength && value.length > parseInt(maxLength)) {
                errorMessage = `${this.getFieldLabel(field)} cannot exceed ${maxLength} characters.`;
                isValid = false;
            }
        }

        // Custom validations
        if (field.name === 'title' && value) {
            if (value.length < 3) {
                errorMessage = 'Title must be at least 3 characters long.';
                isValid = false;
            } else if (value.length > 120) {
                errorMessage = 'Title cannot exceed 120 characters.';
                isValid = false;
            } else if (!/^[a-zA-Z0-9 _.,!?()-]+$/.test(value)) {
                errorMessage = 'Title can only contain English letters, numbers, spaces, and common punctuation marks.';
                isValid = false;
            }
        }

          if (field.name === 'content' && value) {
        // Проверяем, находится ли поле в форме комментария
        const form = field.closest('form');
        if (form && (form.action && form.action.includes('/create-comment') || form.id === 'commentForm')) {
            // Валидация для комментариев
            if (value.length < 1) {
                errorMessage = 'Comment content must contain at least 1 character.';
                isValid = false;
            } else if (value.length > 1000) {
                errorMessage = 'Comment content cannot exceed 1000 characters.';
                isValid = false;
            } else if (!/^[a-zA-Z0-9 _.,!?()\n\r-]+$/.test(value)) {
                errorMessage = 'Comment can only contain English letters, numbers, spaces, and common punctuation marks.';
                isValid = false;
            }
        } else {
            // Валидация для постов (существующая логика)
            if (value.length < 10) {
                errorMessage = 'Content must be at least 10 characters long.';
                isValid = false;
            } else if (value.length > 5000) {
                errorMessage = 'Content cannot exceed 5000 characters.';
                isValid = false;
            } else if (!/^[a-zA-Z0-9 _.,!?()\n\r-]+$/.test(value)) {
                errorMessage = 'Post content can only contain English letters, numbers, spaces, and common punctuation marks.';
                isValid = false;
            }
        }
    }

        if (field.name === 'username' && value) {
            if (value.length < 3) {
                errorMessage = 'Username must be at least 3 characters long.';
                isValid = false;
            } else if (value.length > 20) {
                errorMessage = 'Username cannot exceed 20 characters.';
                isValid = false;
            } else if (!/^[a-zA-Z0-9 _-]+$/.test(value)) {
                errorMessage = 'Username can only contain English letters, numbers, spaces, underscores, and hyphens.';
                isValid = false;
            }
        }

        if (field.name === 'password' && value) {
            if (value.includes(' ')) {
                errorMessage = 'Password cannot contain spaces.';
                isValid = false;
            } else if (value.length < 8) {
                errorMessage = 'Password must be at least 8 characters long.';
                isValid = false;
            } else if (value.length > 72) {
                errorMessage = 'Password is too long (maximum 72 characters).';
                isValid = false;
            }
        }

        if (field.name === 'age' && value) {
            const age = parseInt(value);
            if (isNaN(age)) {
                errorMessage = 'Please enter a valid age.';
                isValid = false;
            } else if (age < 13) {
                errorMessage = 'You must be at least 13 years old to register.';
                isValid = false;
            } else if (age > 120) {
                errorMessage = 'Please enter a valid age (maximum 120 years).';
                isValid = false;
            }
        }

        if (field.name === 'gender' && field.hasAttribute('required') && !value) {
            errorMessage = 'Please select your gender.';
            isValid = false;
        }

        if (field.id === 'gender' && field.hasAttribute('required') && !value) {
            errorMessage = 'Please select your gender.';
            isValid = false;
        }

        if (field.name === 'first_name' && field.hasAttribute('required') && !value) {
            errorMessage = 'First name is required for work forum registration.';
            isValid = false;
        } else if (field.name === 'first_name' && value) {
            if (value.length < 2 || value.length > 50) {
                errorMessage = 'First name must be between 2 and 50 characters.';
                isValid = false;
            } else if (!/^[a-zA-Z0-9 _-]+$/.test(value)) {
                errorMessage = 'First name can only contain English letters, numbers, spaces, underscores, and hyphens.';
                isValid = false;
            }
        }

        if (field.name === 'last_name' && field.hasAttribute('required') && !value) {
            errorMessage = 'Last name is required for work forum registration.';
            isValid = false;
        } else if (field.name === 'last_name' && value) {
            if (value.length < 2 || value.length > 50) {
                errorMessage = 'Last name must be between 2 and 50 characters.';
                isValid = false;
            } else if (!/^[a-zA-Z0-9 _-]+$/.test(value)) {
                errorMessage = 'Last name can only contain English letters, numbers, spaces, underscores, and hyphens.';
                isValid = false;
            }
        }

        if (field.name === 'message' && value) {
            if (value.length > 500) {
                errorMessage = 'Message cannot exceed 500 characters.';
                isValid = false;
            } else if (!/^[a-zA-Z0-9 _.,!?()\n\r-]+$/.test(value)) {
                errorMessage = 'Message can only contain English letters, numbers, spaces, and common punctuation marks.';
                isValid = false;
            }
        }

        if (!isValid) {
            this.showFieldError(field, errorMessage);
        }

        return isValid;
    }

    showFieldError(field, message) {
        this.clearFieldError({ target: field });
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.innerHTML = `
            <span class="field-error-icon"></span>
            <span>${message}</span>
        `;
        
        if (field.classList && field.classList.contains('category-selection')) {
            field.appendChild(errorDiv);
        } else {
            field.parentNode.appendChild(errorDiv);
        }
        
        field.classList.add('error');
    }

    clearFieldError(event) {
        const field = event.target;
        const errorMsg = field.parentNode.querySelector('.field-error') || 
                        (field.nextElementSibling && field.nextElementSibling.classList.contains('field-error') ? field.nextElementSibling : null);
        
        if (errorMsg) {
            errorMsg.remove();
        }
        
        field.classList.remove('error');
    }

    getFieldLabel(field) {
        const label = field.parentNode.querySelector('label');
        return label ? label.textContent.replace('*', '').trim() : field.name;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.formValidator = new FormValidator();
});

// Глобальная функция для инициализации валидации форм (для динамических форм)
window.initFormValidation = function() {
    if (window.formValidator) {
        window.formValidator.bindExistingForms();
    }
};