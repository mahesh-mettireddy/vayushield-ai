import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/base.css';
import './styles/picker.css';
import './styles/hero.css';
import './styles/forecast.css';
import './styles/workspace.css';
import './styles/planner.css';
import './styles/impact.css';
import './styles/roomClean.css';
import './styles/playbook.css';
import './styles/atmosphere.css';
import './styles/effects.css';
import './styles/responsive.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
