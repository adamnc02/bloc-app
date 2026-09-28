import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/motion.css';
import './styles/shell.css';
import { App } from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
