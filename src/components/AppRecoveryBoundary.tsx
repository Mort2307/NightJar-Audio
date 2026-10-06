import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { applyNightjarUpdate } from '../platform/pwa';

type Props = { children: ReactNode };
type State = { failed: boolean; errorId: string | null };

export default class AppRecoveryBoundary extends Component<Props, State> {
  state: State = { failed: false, errorId: null };

  static getDerivedStateFromError(): State {
    return { failed: true, errorId: 'NJ-' + Date.now().toString(36).toUpperCase() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Nightjar recovery boundary]', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ failed: false, errorId: null });
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return <main className="nj-recovery-shell" role="alert">
      <section className="nj-recovery-card">
        <span className="nj-recovery-icon"><ShieldCheck size={22}/></span>
        <span className="mini-label">NIGHTJAR / RECOVERY</span>
        <h1>This part of Nightjar needs a fresh start.</h1>
        <p>The rest of your account has not been changed. Retry the interface first; if the problem remains, repair the local app cache and reload the deployed application.</p>
        {this.state.errorId && <small>Reference {this.state.errorId}</small>}
        <div className="nj-recovery-actions">
          <button className="primary-button" onClick={this.retry}><RefreshCw size={14}/> Try again</button>
          <button className="secondary-button" onClick={() => void applyNightjarUpdate()}>Repair & reload Nightjar</button>
        </div>
      </section>
    </main>;
  }
}
