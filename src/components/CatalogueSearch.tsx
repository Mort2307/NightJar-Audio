import { useEffect, useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';

type Props = {
  categories: string[];
  activeQuery: string;
  activeCategory: string;
  resultCount: number;
  onSearch: (query: string, category: string) => Promise<void>;
};

export default function CatalogueSearch({ categories, activeQuery, activeCategory, resultCount, onSearch }: Props) {
  const [query, setQuery] = useState(activeQuery);
  const [category, setCategory] = useState(activeCategory);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setQuery(activeQuery); }, [activeQuery]);
  useEffect(() => { setCategory(activeCategory); }, [activeCategory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onSearch(query.trim(), category);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setQuery('');
    setCategory('');
    setBusy(true);
    try {
      await onSearch('', '');
    } finally {
      setBusy(false);
    }
  };

  const active = Boolean(activeQuery || activeCategory);

  return <form className="catalogue-search" onSubmit={(event) => void submit(event)} role="search" aria-label="Search Nightjar releases">
    <label className="catalogue-search-input">
      <Search size={15}/>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, mood, trope, genre or tag…" aria-label="Search releases"/>
    </label>
    <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter releases by category">
      <option value="">All categories</option>
      {categories.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
    <button className="secondary-button with-icon" disabled={busy} type="submit"><Search size={14}/> {busy ? 'Searching…' : 'Search'}</button>
    {active && <button className="ghost-button with-icon" disabled={busy} type="button" onClick={() => void clear()}><X size={14}/> Clear</button>}
    <span className="catalogue-search-count" aria-live="polite">{active ? resultCount + ' matching release' + (resultCount === 1 ? '' : 's') : resultCount + ' published release' + (resultCount === 1 ? '' : 's')}</span>
  </form>;
}
