import { Search, SlidersHorizontal, X } from 'lucide-react';

type Props = {
  query: string;
  category: string;
  categories: string[];
  resultCount: number;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onClear: () => void;
};

export default function CatalogueFilters({ query, category, categories, resultCount, onQueryChange, onCategoryChange, onClear }: Props) {
  const active = Boolean(query.trim() || category);
  return <div className="catalogue-filters" aria-label="Catalogue search and filters">
    <label className="catalogue-search"><Search size={15}/><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search titles, creators, moods, tags or tropes…" aria-label="Search published releases"/></label>
    <label className="catalogue-category"><SlidersHorizontal size={14}/><select value={category} onChange={(event) => onCategoryChange(event.target.value)} aria-label="Filter catalogue by category"><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <span className="catalogue-result-count">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
    {active && <button className="ghost-button catalogue-clear" onClick={onClear}><X size={13}/> Clear</button>}
  </div>;
}
