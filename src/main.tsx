import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/product-system.css';
import App from './App';
import AccountPortal from './components/AccountPortal';
import AppRecoveryBoundary from './components/AppRecoveryBoundary';
import LegalDocumentPage from './components/LegalDocumentPage';
import LegalCentrePage from './components/LegalCentrePage';
import { registerNightjarServiceWorker } from './platform/pwa';

const root = document.getElementById('root');
if (!root) throw new Error('Nightjar root missing');

const isAccountPortal = window.location.pathname === '/account' || window.location.pathname.startsWith('/account/');
const isLegalDocument = window.location.pathname.startsWith('/legal/');
const isLegalCentre = window.location.pathname === '/legal' || window.location.pathname === '/legal/';

try {
  const cleanUrl = new URL(window.location.href);
  if (cleanUrl.searchParams.has('nightjar-refresh')) {
    cleanUrl.searchParams.delete('nightjar-refresh');
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }
} catch {
  // URL cleanup is cosmetic and must never block Nightjar.
}

registerNightjarServiceWorker();

createRoot(root).render(
  <StrictMode>
    <AppRecoveryBoundary>
      {isLegalCentre ? <LegalCentrePage /> : isLegalDocument ? <LegalDocumentPage /> : isAccountPortal ? <AccountPortal /> : <App />}
    </AppRecoveryBoundary>
  </StrictMode>,
);
