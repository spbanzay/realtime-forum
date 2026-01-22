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
        <div class="page">
            <main class="main-single-column">
                <section class="content error-content-centered">
                    <div class="error-container">
                        <div class="error-icon-box">
                            <div class="error-icon">${icons[code] || '⚠️'}</div>
                            <h1 class="error-title">${code} - ${titles[code] || 'Error'}</h1>
                            <div class="page-divider"></div>
                            <div class="error-message">
                                <p>${message || errorInfo.primary}</p>
                                ${!message ? `<p>${errorInfo.secondary}</p>` : ''}
                            </div>
                        </div>
                        
                        <div class="back-to-home">
                            <a href="/" class="btn btn-secondary" onclick="event.preventDefault(); window.router.navigate('/')">← Back to Home</a>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    `;
};