import { useEffect, useState } from 'react';
import { Accessibility, BookOpenText, Check, Contrast, RefreshCw, Text } from 'lucide-react';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  nightjarAccessibility,
  type AccessibilityPreferences as Preferences,
} from '../platform/firebase-accessibility';

export default function AccessibilityPreferences() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const [baseline, setBaseline] = useState<Preferences>(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void nightjarAccessibility.get()
      .then((value) => {
        if (cancelled) return;
        const safe = { ...DEFAULT_ACCESSIBILITY_PREFERENCES, ...(value && typeof value === 'object' ? value : {}) };
        setPreferences(safe);
        setBaseline(safe);
      })
      .catch(() => {
        if (!cancelled) setMessage('Nightjar could not load accessibility preferences yet.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const dirty = JSON.stringify(preferences) !== JSON.stringify(baseline);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const next = await nightjarAccessibility.save(preferences);
      const safe = { ...DEFAULT_ACCESSIBILITY_PREFERENCES, ...(next && typeof next === 'object' ? next : {}) };
      setPreferences(safe);
      setBaseline(safe);
      setMessage('Accessibility preferences saved.');
    } catch {
      setMessage('Nightjar could not save accessibility preferences yet.');
    } finally {
      setSaving(false);
    }
  };

  return <article className="panel premium-user-card accessibility-preferences">
    <div className="premium-user-card-head">
      <div><span className="mini-label">ACCESSIBILITY</span><h2>Make Nightjar work the way you need it to.</h2></div>
      <Accessibility size={19}/>
    </div>
    <p className="panel-note">
      These preferences follow your Nightjar account across devices. The player always keeps its own Transcript button available,
      regardless of your default.
    </p>

    <div className="accessibility-preference-grid" aria-busy={loading}>
      <label className="accessibility-preference-row">
        <BookOpenText size={17}/>
        <span><strong>Transcript default</strong><small>Choose whether available transcripts open automatically when you start a release.</small></span>
        <select
          value={preferences.transcriptMode}
          disabled={loading || saving}
          onChange={(event) => setPreferences((current) => ({
            ...current,
            transcriptMode: event.target.value as Preferences['transcriptMode'],
          }))}
        >
          <option value="on_demand">Open when I ask</option>
          <option value="always_open">Always open with playback</option>
        </select>
      </label>

      <label className="accessibility-preference-row">
        <RefreshCw size={17}/>
        <span><strong>Follow playback</strong><small>For timed transcripts, keep the current line centred as the audio progresses.</small></span>
        <input
          type="checkbox"
          checked={preferences.transcriptFollowPlayback}
          disabled={loading || saving}
          onChange={(event) => setPreferences((current) => ({
            ...current,
            transcriptFollowPlayback: event.target.checked,
          }))}
        />
      </label>

      <label className="accessibility-preference-row">
        <Text size={17}/>
        <span><strong>Transcript text size</strong><small>Increase transcript text without changing the rest of the interface.</small></span>
        <select
          value={preferences.transcriptTextSize}
          disabled={loading || saving}
          onChange={(event) => setPreferences((current) => ({
            ...current,
            transcriptTextSize: event.target.value as Preferences['transcriptTextSize'],
          }))}
        >
          <option value="standard">Standard</option>
          <option value="large">Large</option>
          <option value="extra_large">Extra large</option>
        </select>
      </label>

      <label className="accessibility-preference-row">
        <Contrast size={17}/>
        <span><strong>Higher transcript contrast</strong><small>Strengthen transcript foreground/background separation for easier reading.</small></span>
        <input
          type="checkbox"
          checked={preferences.transcriptHighContrast}
          disabled={loading || saving}
          onChange={(event) => setPreferences((current) => ({
            ...current,
            transcriptHighContrast: event.target.checked,
          }))}
        />
      </label>
    </div>

    {message && <div className="accessibility-preference-message" role="status">{message}</div>}

    <div className="accessibility-preference-actions">
      {dirty && <button className="ghost-button" type="button" disabled={saving} onClick={() => setPreferences(baseline)}>Revert</button>}
      <button className="primary-button" type="button" disabled={loading || saving || !dirty} onClick={() => void save()}>
        <Check size={14}/>{saving ? 'Saving…' : dirty ? 'Save accessibility preferences' : 'Saved'}
      </button>
    </div>
  </article>;
}
