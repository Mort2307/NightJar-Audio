import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Copy, RefreshCw, ShieldCheck } from 'lucide-react';
import './profile-error-recovery.css';

type Props = { children: ReactNode };
type State = { failed: boolean; errorId: string | null; diagnostic: string };

export default class AppRecoveryBoundary extends Component<Props, State> {
  state: State = { failed: false, errorId: null, diagnostic: '' };

  static getDerivedStateFromError(): State {
    return { failed: true, errorId: 'NJ-' + Date.now().toString(36).toUpperCase(), diagnostic: '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Nightjar recovery boundary]', error, info.componentStack);
    // A local-only, user-controlled diagnostic. Never send profile or auth data.
    this.setState({
      diagnostic: [
        'Nightjar app recovery',
        'Reference: ' + this.state.errorId,
        'Route: ' + window.location.pathname,
        'Error: ' + String(error.message ?? 'Unknown rendering error').slice(0, 600),
        'Component stack: ' + String(info.componentStack ?? '').slice(0, 1700),
      ].join('\n'),
    });
  }

  private retry = () => {
    this.setState({ failed: false, errorId: null, diagnostic: '' });
  };

  private copyDiagnostic = async () => {
    try { await navigator.clipboard.writeText(this.state.diagnostic); }
    catch { /* Error details remain selectable on screen. */ }
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return <main className="nj-recovery-shell" role="alert">
      <section className="nj-recovery-card">
        <span className="nj-recovery-icon"><ShieldCheck size={22}/></span>
        <span className="mini-label">NIGHTJAR / RECOVERY</span>
        <h1>This part of Nightjar needs a fresh start.</h1>
        <p>The rest of your account has not been changed. Retry the interface first; if the problem remains, reload the application.</p>
        {this.state.errorId && <small>Reference {this.state.errorId}</small>}
        <div className="nj-recovery-actions">
          <button className="primary-button" onClick={this.retry}><RefreshCw size={14}/> Try again</button>
          <button className="secondary-button" onClick={() => window.location.reload()}>Reload Nightjar</button>
          <button className="ghost-button" type="button" onClick={() => void this.copyDiagnostic()}><Copy size={14}/> Copy error details</button>
        </div>
        {this.state.diagnostic && <details className="nj-recovery-details"><summary>Technical details for Nightjar support</summary><pre>{this.state.diagnostic}</pre></details>}
      </section>
    </main>;
  }
}
