import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Helmet } from 'react-helmet';

import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './styles/reset.css';
import './index.css';

// Log environment mode for debugging
if (import.meta.env.DEV) {
  console.log('Running in development mode');
}

// Only apply CSP in production mode
const isProduction = import.meta.env.PROD;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isProduction ? (
      <Helmet>
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://localhost:5037 https://neuromotion-api.example.com; form-action 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; block-all-mixed-content; upgrade-insecure-requests;" />
        <meta http-equiv="X-Content-Type-Options" content="nosniff" />
        <meta http-equiv="X-Frame-Options" content="DENY" />
        <meta http-equiv="X-XSS-Protection" content="1; mode=block" />
        <meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=(), interest-cohort=()" />
      </Helmet>
    ) : (
      // 开发环境使用相对安全的CSP
      <Helmet>
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'self' localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' localhost:*; connect-src 'self' localhost:* ws://localhost:*; img-src 'self' data: blob: localhost:*; style-src 'self' 'unsafe-inline' localhost:* https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self'; object-src 'none';" />
        <meta http-equiv="X-Content-Type-Options" content="nosniff" />
      </Helmet>
    )}
    <App />
  </React.StrictMode>
); 