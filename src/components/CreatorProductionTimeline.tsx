import { useState } from 'react';
import { BookOpenText, Brush, Clock3, FileAudio2, Headphones, RefreshCw } from 'lucide-react';
import { nightjarExperience, type ProductionItem } from '../platform/firebase-experience';
import './listening-experience.css';

const roles = [
  { id: 'creator', label: 'Voice Acting', icon: Headphones },
  { id: 'writer', label: 'Writing', icon: BookOpenText },
  { id: 'editor', label: 'Audio Editing', icon: FileAudio2 },
  { id: 'artist', label: 'Artwork', icon: Brush },
] as const;

const stage = (status: string) => {
  const value = status.toLowerCase();
  if (['released','published','approved'].includes(value)) return 'Approved / Published';
  if (value.includes('reject') || value.includes('revision') || value.includes('changes')) return 'Needs changes';
  if (value.includes('review') || value.includes('submit') || value.includes('pending')) return 'In review';
  if (value.includes('scheduled')) return 'Scheduled';
  return 'Draft / In progress';
};
type Props = { notify: (message: string) => void; simulationMode?: boolean };

export default function CreatorProductionTimeline({ notify, simulationMode = false }: Props) {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    if (simulationMode) return;
    setLoading(true);
    try { setItems(await nightjarExperience.timeline()); }
    catch { notify('Your production timeline could not be loaded.'); }
    finally { setLoading(false); }
  };
  const visible = items.filter((item) => filter === 'all' || item.role === filter);
  const statuses = ['Draft / In progress','Needs changes','In review','Scheduled','Approved / Published'];

  return <section className="nj-production-timeline" aria-label="Cross-role production timeline">
    <div className="nj-experience-heading"><Clock3 size={20}/><div><strong>My Production Timeline</strong><small>VA, Writer, Editor and Artist work on one private progress board.</small></div></div>
    <div className="nj-timeline-actions"><button type="button" className="secondary-button" onClick={() => {
      setOpened((value) => !value);
      if (!opened) void load();
    }} aria-expanded={opened}>{opened ? 'Close timeline' : 'Open my timeline'}</button>
      {opened && <button type="button" className="ghost-button" onClick={() => void load()} disabled={loading || simulationMode}><RefreshCw size={15}/> Refresh</button>}
    </div>
    {opened && <>
      <p>One view across your approved professional roles. This is a read-only overview; edit each item in its own Studio.</p>
      <div className="nj-mood-options" role="group" aria-label="Filter professional work">
        <button type="button" className={filter === 'all' ? 'secondary-button active' : 'ghost-button'}
          onClick={() => setFilter('all')}>All work</button>
        {roles.map((role) => <button type="button" key={role.id}
          className={filter === role.id ? 'secondary-button active' : 'ghost-button'}
          onClick={() => setFilter(role.id)}><role.icon size={14}/> {role.label}</button>)}
      </div>
      {simulationMode ? <p className="nj-experience-empty">The production timeline uses actual private records and is unavailable in simulation.</p>
        : loading ? <p className="nj-experience-empty">Loading your production work…</p>
        : visible.length === 0 ? <p className="nj-experience-empty">No production records in this category yet.</p>
        : <div className="nj-timeline-board">
          {statuses.map((label) => {
            const group = visible.filter((item) => stage(item.status) === label);
            return <div className="nj-timeline-stage" key={label}>
              <h3>{label} <span>{group.length}</span></h3>
              {group.slice(0, 40).map((item) => <article key={item.role + ':' + item.id}>
                <strong>{item.title || 'Untitled project'}</strong>
                <small>{roles.find((role) => role.id === item.role)?.label || item.role} · {item.status}</small>
              </article>)}
              {!group.length && <small>No work in this stage</small>}
            </div>;
          })}
        </div>}
    </>}
  </section>;
}
