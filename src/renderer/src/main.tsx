import './assets/tailwind.css';
import ReactDOM from 'react-dom/client';
import App from './components/App';

// Forward standard logging to Tauri's logging system
import './logging';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />,
);
