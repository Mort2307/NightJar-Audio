import { useEffect, useState } from 'react';
import { Headphones, Mic2, Play, Save } from 'lucide-react';
import { nightjarExperience } from '../platform/firebase-experience';
import './listening-experience.css';

type StudioProps = {
  creatorUserId: string;
  releases: Array<{ id: string; title?: string; status?: string }>;
  notify: (message: string) => void; simulationMode?: boolean;
};

export function VoiceCallingCardStudio({ creatorUserId, releases, notify, simulationMode = false }: StudioProps) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const published = releases.filter((item) => item.status === 'released');

  useEffect(() => {
    if (!creatorUserId || simulationMode) return;
    let cancelled = false;
    setLoading(true);
    void nightjarExperience.voiceCard(creatorUserId).then((card) => {
      if (!cancelled) setSelected(card.releaseId ?? '');
    }).catch(() => { if (!cancelled) notify('Your Voice Calling Card could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [creatorUserId, simulationMode]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!simulationMode) await nightjarExperience.saveVoiceCard(selected || null);
      notify(simulationMode
        ? 'Simulation: Voice Calling Card selection saved locally.'
        : selected ? 'Voice Calling Card updated. This featured recording was already approved and published.' : 'Voice Calling Card removed.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Voice Calling Card could not be saved.');
    } finally { setSaving(false); }
  };
  return <section className="nj-voice-card-editor">
    <div className="nj-experience-heading"><Mic2 size={20}/><div><strong>My Voice Calling Card</strong><small>Choose a published recording that introduces listeners to your performance.</small></div></div>
    <p>Your featured voice example uses an existing NightJar-approved release. It never opens an unmoderated audio-upload route, and normal subscriber access still applies.</p>
    <label>Featured published recording
      <select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={loading}>
        <option value="">No featured recording</option>
        {published.map((item) => <option key={item.id} value={item.id}>{item.title || 'Untitled release'}</option>)}
      </select>
    </label>
    <button type="button" className="secondary-button" disabled={saving || loading || !creatorUserId} onClick={() => void save()}>
      <Save size={15}/>{saving ? 'Saving…' : 'Save Voice Calling Card'}
    </button>
    {!published.length && <small>Release an approved recording before selecting your voice example.</small>}
  </section>;
}

type PublicProps = {
  creatorUserId: string;
  onPlayRelease?: (release: any) => void;
  demoMode?: boolean;
  readOnly?: boolean;
};

export function VoiceCallingCardPublic({ creatorUserId, onPlayRelease, demoMode = false, readOnly = false }: PublicProps) {
  const [release, setRelease] = useState<any | null>(null);
  useEffect(() => {
    if (!creatorUserId || demoMode) return;
    let cancelled = false;
    setRelease(null);
    void nightjarExperience.voiceCard(creatorUserId).then((card) => {
      if (!cancelled) setRelease(card.release);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [creatorUserId, demoMode]);
  if (!release) return null;
  return <aside className="nj-voice-card-public">
    <div className="nj-experience-heading"><Headphones size={20}/><div><strong>Hear this Creator</strong><small>Featured, moderated NightJar recording · listening access required</small></div></div>
    <p>{release.title || 'A featured performance'}</p>
    <button type="button" className="secondary-button" disabled={readOnly} onClick={() => {
      if (readOnly) return;
      if (onPlayRelease) onPlayRelease(release);
      else window.location.assign('/discover?release=' + encodeURIComponent(String(release.id)));
    }}><Play size={15}/> Open featured recording</button>
  </aside>;
}
