window.renderError = function(code, message) {
    const app = document.getElementById('app');
    
    const icons = {
        400: '⚠️',
        404: '🔍', 
        500: '⚠️'
    };

    const titles = {
        400: 'Bad Request',
        404: 'Page Not Found',
        500: 'Internal Server Error'
    };

    const defaultMessages = {
        400: {
            primary: 'The request you sent to the server is invalid or malformed.',
            secondary: 'Please check your input and try again. If you continue to have problems, please contact support.'
        },
        404: {
            primary: 'Sorry, the page you\'re looking for doesn\'t exist or has been moved.',
            secondary: 'This could happen if the post was deleted, the URL was mistyped, or you followed a broken link.'
        },
        500: {
            primary: 'We\'re experiencing some technical difficulties on our end.',
            secondary: 'Our team has been notified and is working on fixing this issue. Please try again in a few moments.'
        }
    };

    const errorInfo = defaultMessages[code] || { 
        primary: 'An error occurred', 
        secondary: 'Please try again later.' 
    };

    app.innerHTML = `
        <div class="page" style="min-height: 80vh; display: flex; flex-direction: column;">
            <main class="main-single-column" style="flex: 1; display: flex; align-items: center; justify-content: center;">
                <section class="content error-content-centered" style="width: 100%; display: flex; justify-content: center;">
                    <div class="error-container" style="text-align: center; max-width: 500px; padding: 40px 20px;">
                        <div class="error-icon-box">
                            <div class="error-icon" style="font-size: 80px; margin-bottom: 20px;">${icons[code] || '⚠️'}</div>
                            <h1 class="error-title" style="margin-bottom: 10px;">${code} - ${titles[code] || 'Error'}</h1>
                            <div class="page-divider" style="height: 2px; background: #eee; width: 60px; margin: 20px auto;"></div>
                            <div class="error-message" style="color: #666; font-size: 1.1rem; line-height: 1.5;">
                                <p><strong>${message || errorInfo.primary}</strong></p>
                                ${!message ? `<p style="margin-top: 10px; font-size: 0.95rem; opacity: 0.8;">${errorInfo.secondary}</p>` : ''}
                            </div>
                        </div>
                        
                        <div class="back-to-home" style="margin-top: 40px;">
                            <a href="/" class="btn btn-secondary" style="padding: 10px 25px; text-decoration: none;" onclick="event.preventDefault(); window.router.navigate('/')">← Back to Home</a>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    `;
};