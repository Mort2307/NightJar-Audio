import { useEffect, useState } from 'react';
import { ArrowRight, FileCheck2, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarLegal, type LegalAgreementStatus } from '../platform/firebase-legal';
import { nightjarAuth } from '../platform/firebase-auth';

/** Explicit current-version account terms + privacy NOTICE acknowledgement.
 * Not consent to optional analytics, marketing, OS permissions or surveillance.
 */
export default function MemberSecurityGate({ onComplete }: { onComplete: () => void }) {
  const [documents, setDocuments] = useState<LegalAgreementStatus[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await nightjarLegal.status();
      const required = (response.documents ?? []).filter((doc) => doc.requiredForAccount);
      if (required.length < 2) throw new Error('The mandatory Nightjar documents were not returned.');
      setDocuments(required);
      if (required.every((doc) => doc.accepted)) onComplete();
    } catch {
      setError('Nightjar could not verify the current security agreement. Access remains protected; please retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const missing = documents.filter((doc) => !doc.accepted);
  const ready = missing.length > 0 && missing.every((doc) => checked[doc.id] === true);

  const accept = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    try {
      await nightjarLegal.accept(missing.map((doc) => ({
        id: doc.id, version: doc.version, accepted: true as const,
      })), 'mandatory_account_security_gate');
      const response = await nightjarLegal.status();
      if (!(response.documents ?? []).filter((doc) => doc.requiredForAccount).every((doc) => doc.accepted)) {
        throw new Error('Your updated agreement could not be confirmed by the server.');
      }
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not confirm your agreements.');
    } finally {
      setSaving(false);
    }
  };

  return <main className="access-shell" aria-label="Nightjar current terms and security notice">
    <section className="access-card" style={{ maxWidth: 700 }}>
      <span className="mini-label"><ShieldCheck size={15}/> REQUIRED ACCOUNT UPDATE</span>
      <h1>Protecting your Nightjar account and creative work</h1>
      <p className="access-lede">Nightjar has strengthened its protections for listeners, creators and creative work. Please review and accept any updated Terms before entering the app; the Privacy Notice remains a separate acknowledgement.</p>
      <p><strong>Fair protection for everyone.</strong> Unauthorised copying or disclosure of protected work can lead to reviewed account action and lawful rights-holder remedies. Good-faith reports, creators’ ownership, lawful disclosures and members’ right to challenge decisions remain protected.</p>
      <p>Nightjar may record limited security events tied to your account: protected-content access, blocked copying or printing, and screenshot or recording signals where your device supports them. These signals are not proof of misuse and administrators review evidence before taking action.</p>
      <p><strong>No keylogging.</strong> We do not record ordinary typing, passwords, clipboard contents or private messages as security telemetry. Optional notification and marketing permissions are separate choices.</p>
      <div className="legal-agreement-list" aria-busy={loading}>
        {documents.map((doc) => <article key={doc.id} className="legal-agreement-row">
          <div className="legal-agreement-state"><FileCheck2 size={17}/></div>
          <div>
            <strong>{doc.title}</strong>
            <span>Version {doc.version}</span>
            <a href={doc.path} target="_blank" rel="noopener noreferrer">Read full document <ArrowRight size={12}/></a>
          </div>
          {doc.accepted ? <span className="status-pill">CURRENT</span> : <label className="rights-check">
            <input type="checkbox" checked={checked[doc.id] === true} onChange={(e) => setChecked((v) => ({...v, [doc.id]:e.target.checked}))}/>
            <span>{doc.id === 'privacy_notice' ? 'I acknowledge I have been shown this privacy notice' : 'I have reviewed and agree to these Terms of Use, including the fair protection of creative works'}</span>
          </label>}
        </article>)}
      </div>
      <p className="access-fine">Security monitoring is limited to Nightjar itself. It cannot detect every screenshot or prevent a second device photographing a screen. You can contact Nightjar Support to challenge an account restriction.</p>
      {error && <p className="access-note" role="alert">{error}</p>}
      <div className="legal-agreement-actions">
        <button className="secondary-button" type="button" disabled={loading || saving} onClick={() => void load()}><RefreshCw size={14}/> Retry</button>
        <button className="primary-button" type="button" disabled={!ready || loading || saving} onClick={() => void accept()}>{saving ? 'Saving securely…' : 'Accept and continue'} <ArrowRight size={16}/></button>
      </div>
      <button type="button" className="ghost-button" disabled={saving} onClick={() => void nightjarAuth.signOut()}>Decline and sign out</button>
      <p className="access-fine">Declining does not waive your statutory rights. You can contact Nightjar Support about your account, privacy or an access decision.</p>
    </section>
  </main>;
}
