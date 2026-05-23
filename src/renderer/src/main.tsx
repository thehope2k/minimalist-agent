import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';
// Monaco worker + local loader config — must run before any editor renders.
import './lib/monaco-setup';
// Bundled terminal fonts — included so the terminal looks good out of the box
// regardless of what the user has installed on their system.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/700.css';
import '@fontsource/cascadia-code/400.css';
import '@fontsource/cascadia-code/700.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
