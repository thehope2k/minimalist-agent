import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';
// Monaco worker + local loader config — must run before any editor renders.
import './lib/monaco-setup';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
