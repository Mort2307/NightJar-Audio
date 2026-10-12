import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';

type Props = { title: string; children: ReactNode };
type State = { failed: boolean; reference: string; diagnostic: string; attempt: number };

const safeMessage = (error: unknown) => {
  const value = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return value.slice(0, 600);
};

export default class ProfileSectionBoundary extends Component<Props, State> {
  state: State = { failed: false, reference: '', diagnostic: '', attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true, reference: 'NJ-P-' + Date.now().toString(36).toUpperCase() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Nightjar profile section]', this.props.title, error, info.componentStack);
    this.setState({
      diagnostic: [
        'Nightjar profile section: ' + this.props.title,
        'Reference: ' + this.state.reference,
        'Route: ' + window.location.pathname,
        'Error: ' + safeMessage(error),
        'Component stack: ' + String(info.componentStack ?? '').slice(0, 1700),
      ].join('\n'),
    });
  }

  private retry = () => {
    this.setState((state) => ({ failed: false, diagnostic: '', reference: '', attempt: state.attempt + 1 }));
  };

  private copy = async () => {
    try { await navigator.clipboard.writeText(this.state.diagnostic); }
    catch { /* The diagnostic is also selectable in the details panel below. */ }
  };

  render() {
    if (!this.state.failed) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;

    return <section className="nj-profile-section-failed panel" role="alert" aria-label={this.props.title + ' recovery'}>
      <AlertTriangle size={22} aria-hidden="true" />
      <div>
        <strong>{this.props.title} could not open.</strong>
        <p>Other parts of your account remain available. Your saved profile has not been deleted or reset.</p>
        <small>Reference {this.state.reference}</small>
        <div className="nj-profile-section-recovery-actions">
          <button type="button" className="secondary-button" onClick={this.retry}><RefreshCw size={14}/> Try this section again</button>
          <button type="button" className="ghost-button" onClick={() => void this.copy()}><Copy size={14}/> Copy error details</button>
        </div>
        <details><summary>Technical details for Nightjar support</summary><pre>{this.state.diagnostic}</pre></details>
      </div>
    </section>;
  }
}
