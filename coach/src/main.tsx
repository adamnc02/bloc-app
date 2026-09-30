import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/motion.css';
import './styles/shell.css';
import './styles/auth.css';
import './styles/diary.css';
import { App } from './app/App';
import { listenForOpenMessages } from './push/intent';

// §158: before React, so a notification tap on a cold start isn't missed while Coach signs in.
listenForOpenMessages();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
