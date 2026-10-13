import { useEffect, useState } from 'react';
import { Headphones, ShieldCheck, Sparkles, SlidersHorizontal } from 'lucide-react';
import { nightjarExperience, type ListeningBoundaries } from '../platform/firebase-experience';
import { DEFAULT_LISTENING_BOUNDARIES, MOOD_FILTERS, type MoodFilter } from '../platform/listening-discovery';
import './listening-experience.css';

type Props = {
  mood: MoodFilter; onMoodChange: (mood: MoodFilter) => void;
  boundaries: ListeningBoundaries; onBoundariesChange: (value: ListeningBoundaries) => void;
  notify: (message: string) => void; simulationMode?: boolean;
};
const ratings = [
  { id: 'sfw', title: 'SFW' }, { id: 'suggestive', title: 'Suggestive' },
  { id: 'adult', title: 'Adult' }, { id: 'explicit', title: 'Explicit' },
];

export default function ListeningDiscoveryControls({
  mood, onMoodChange, boundaries, onBoundariesChange, notify, simulationMode = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [terms, setTerms] = useState(boundaries.hiddenTerms.join(', '));
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (simulationMode) { setLoaded(true); return; }
    let cancelled = false;
    void nightjarExperience.boundaries().then((settings) => {
      if (cancelled) return;
      onBoundariesChange(settings);
      setTerms(settings.hiddenTerms.join(', '));
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) {
        setLoaded(true);
        notify('Your private listening preferences could not be loaded.');
      }
    });
    return () => { cancelled = true; };
  }, [simulationMode]);

  const save = async () => {
    if (saving) return;
    const value: ListeningBoundaries = {
      excludedRatings: boundaries.excludedRatings,
      hiddenTerms: Array.from(new Set(terms.split(',').map((term) => term.trim().toLowerCase()).filter(Boolean))).slice(0, 12),
    };
    setSaving(true);
    try {
      const result = simulationMode ? value : await nightjarExperience.saveBoundaries(value);
      onBoundariesChange(result);
      setTerms(result.hiddenTerms.join(', '));
      setEditing(false);
      notify(simulationMode ? 'Simulation preferences saved locally.' : 'Your private listening boundaries are saved to your account.');
    } catch {
      notify('Listening preferences could not be saved; please retry.');
    } finally { setSaving(false); }
  };
  const toggleRating = (rating: string) => {
    const excludedRatings = boundaries.excludedRatings.includes(rating)
      ? boundaries.excludedRatings.filter((value) => value !== rating)
      : [...boundaries.excludedRatings, rating];
    onBoundariesChange({ ...boundaries, excludedRatings });
  };
  return <section className="nj-listening-experience" aria-label="Mood discovery and private listening boundaries">
    <div className="nj-experience-heading"><Sparkles size={20}/><div><strong>Listen by Mood</strong><small>Explore by atmosphere using Creator-supplied tags. No AI recommendations or extra provider fees.</small></div></div>
    <div className="nj-mood-options" role="group" aria-label="Choose listening mood">
      {MOOD_FILTERS.map((option) => <button key={option.id} type="button"
        className={mood === option.id ? 'secondary-button active' : 'ghost-button'}
        onClick={() => onMoodChange(option.id)} aria-pressed={mood === option.id}>{option.label}</button>)}
    </div>
    <div className="nj-listening-boundaries-head">
      <div><ShieldCheck size={18}/><span><strong>My Listening Boundaries</strong><small>Private to your account · does not replace 18+ verification</small></span></div>
      <button type="button" className="secondary-button" onClick={() => {setEditing(!editing);setTerms(boundaries.hiddenTerms.join(', '));}} aria-expanded={editing} disabled={!loaded}><SlidersHorizontal size={15}/>{editing ? 'Close' : 'Adjust'}</button>
    </div>
    {editing && <div className="nj-listening-boundaries-form">
      <p>Hide releases with these content levels from Discovery. You can change your preferences whenever you want.</p>
      <div className="nj-boundary-ratings">{ratings.map((rating) => <label key={rating.id}>
        <input type="checkbox" checked={boundaries.excludedRatings.includes(rating.id)}
          onChange={() => toggleRating(rating.id)} /> Hide {rating.title}
      </label>)}</div>
      <label className="nj-boundary-terms">Topics to avoid (separate with commas)
        <input type="text" value={terms} maxLength={500} onChange={(event) => setTerms(event.target.value)}
          placeholder="e.g. violence, horror, grief" /></label>
      <small>Matching depends on the content levels and descriptions provided by Creators. Unlabelled themes may still appear. Your preferences are not made public.</small>
      <button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>
        <Headphones size={15}/>{saving ? 'Saving…' : 'Save private preferences'}
      </button>
    </div>}
  </section>;
}
