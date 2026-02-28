import './assets/tailwind.css';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import { initializeTauriBridge } from './tauriBridge';

// Forward standard logging to Tauri's logging system
import './logging';

initializeTauriBridge();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
