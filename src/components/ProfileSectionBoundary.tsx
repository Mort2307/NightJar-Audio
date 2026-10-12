import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Copy, Download, RefreshCw } from 'lucide-react';
import { applyNightjarSafeUpdate } from '../platform/pwa';

type Props = { title: string; children: ReactNode };
type State = { failed: boolean; reference: string; diagnostic: string; attempt: number; outdatedModule: boolean };

const safeMessage = (error: unknown) => {
  const value = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return value.slice(0, 600);
};

export default class ProfileSectionBoundary extends Component<Props, State> {
  state: State = { failed: false, reference: '', diagnostic: '', attempt: 0, outdatedModule: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    const message = String(error?.message ?? '');
    return {
      failed: true,
      reference: 'NJ-P-' + Date.now().toString(36).toUpperCase(),
      outdatedModule: /dynamically imported module|failed to fetch module|loading chunk|importing a module script/i.test(message),
    };
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

  private refreshApp = async () => {
    if (!window.confirm('Update or reload Nightjar? Unsaved edits on this page may be lost.')) return;
    try {
      const updated = await applyNightjarSafeUpdate();
      if (!updated) window.location.reload();
    } catch {
      window.location.reload();
    }
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
        <p>{this.state.outdatedModule ? 'This screen may belong to an older installed Nightjar build. Update your app and retry.' : 'Other parts of your account remain available. Your saved profile has not been deleted or reset.'}</p>
        <small>Reference {this.state.reference}</small>
        <div className="nj-profile-section-recovery-actions">
          <button type="button" className="secondary-button" onClick={this.retry}><RefreshCw size={14}/> Try this section again</button>
          {this.state.outdatedModule && <button type="button" className="secondary-button" onClick={() => void this.refreshApp()}><Download size={14}/> Update Nightjar</button>}
          <button type="button" className="ghost-button" onClick={() => void this.copy()}><Copy size={14}/> Copy error details</button>
        </div>
        <details><summary>Technical details for Nightjar support</summary><pre>{this.state.diagnostic}</pre></details>
      </div>
    </section>;
  }
}
