import { useMemo, useState } from 'react';
import { BookOpenText, Search } from 'lucide-react';
import { NIGHTJAR_HELP, type HelpTopic } from './ContextHelp';
import './help-glossary.css';

const categories = {
  'Rights & licensing': [
    'exclusive-licence','non-exclusive-licence','licence-choice','copyright','licence-term',
    'licence-status','usage-rights','commercial-use',
    'withdrawal-terms','rights-confirmation','adaptation-approval',
  ],
  'Marketplace & manuscripts': [
    'marketplace-visibility','public-synopsis','protected-sample','protected-reader',
    'writer-review','admin-notes',
  ],
  'Working together': ['collaboration-count','collaboration-status','verified-status'],
  'Releases & NightJar': [
    'first-on-nightjar','nightjar-original','transcript','admin-review-notification',
  ],
} as const;

export default function HelpGlossary() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<keyof typeof categories | 'All topics'>('All topics');
  const records = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const ids = category === 'All topics'
      ? Object.keys(NIGHTJAR_HELP) as HelpTopic[]
      : [...categories[category]] as HelpTopic[];
    return ids.filter(id => !['licence-price','counteroffer'].includes(id)).map(id => ({ id, ...NIGHTJAR_HELP[id] }))
      .filter(item => !needle || [item.title, item.description, item.detail].join(' ').toLowerCase().includes(needle));
  }, [query, category]);

  return <section className="panel nj-help-glossary" aria-label="NightJar help and terminology">
    <div className="nj-help-glossary-head"><BookOpenText size={20}/><div><span className="mini-label">BUILT-IN EXPLANATIONS</span><h2>NightJar Help & Terms</h2><p>Not sure what something means? Tap any ℹ️ beside a term throughout the app, or find it here.</p></div></div>
    <div className="nj-help-glossary-tools">
      <label><Search size={16}/><input aria-label="Search explanations" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search licences, reviews and rights…"/></label>
      <select aria-label="Filter help topics" value={category} onChange={event=>setCategory(event.target.value as keyof typeof categories | 'All topics')}>
        <option value="All topics">All topics</option>
        {Object.keys(categories).map(name=><option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    <div className="nj-help-glossary-list">
      {records.map(item=><details key={item.id}>
        <summary>{item.title}<span aria-hidden="true">ℹ️</span></summary>
        <p>{item.description}</p><p>{item.detail}</p>
      </details>)}
      {records.length===0&&<p>No explanations match that search. Try a different term.</p>}
    </div>
    <p className="nj-help-glossary-caveat">These explanations describe NightJar features in plain language. They are not a substitute for a signed licence, the platform terms, or independent legal advice.</p>
  </section>;
}
