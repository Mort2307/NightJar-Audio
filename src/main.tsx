import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import AccountPortal from './components/AccountPortal';

const root = document.getElementById('root');
if (!root) throw new Error('Nightjar root missing');

const isAccountPortal = window.location.pathname === '/account' || window.location.pathname.startsWith('/account/');

createRoot(root).render(
  <StrictMode>
    {isAccountPortal ? <AccountPortal /> : <App />}
  </StrictMode>,
);
