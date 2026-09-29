import { useMemo, useState } from 'react';
import { Search, Plus } from 'lucide-react';

type Props = {
  label: string;
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
  maxItems?: number;
  allowCreate?: boolean;
  createLabel?: string;
  helperText?: string;
};

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 48);

export default function SearchableMultiSelect({
  label,
  options,
  values,
  onChange,
  maxItems = 16,
  allowCreate = false,
  createLabel = 'Create custom tag',
  helperText,
}: Props) {
  const [query, setQuery] = useState('');
  const selected = Array.isArray(values) ? values : [];

  const allOptions = useMemo(
    () => Array.from(new Set([...options, ...selected])).filter(Boolean),
    [options, selected],
  );

  const normalizedQuery = tidy(query);
  const filteredOptions = useMemo(() => {
    const needle = normalizedQuery.toLocaleLowerCase();
    if (!needle) return allOptions;
    return allOptions.filter((option) => option.toLocaleLowerCase().includes(needle));
  }, [allOptions, normalizedQuery]);

  const exactMatch = normalizedQuery
    ? allOptions.some((option) => option.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase())
    : false;

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((value) => value !== option));
      return;
    }
    if (selected.length >= maxItems) return;
    onChange([...selected, option]);
  };

  const createCustom = () => {
    if (!allowCreate || !normalizedQuery || exactMatch || selected.length >= maxItems) return;
    onChange([...selected, normalizedQuery]);
    setQuery('');
  };

  return <div className="profile-multi-field">
    <span className="profile-multi-label">{label}</span>
    {helperText && <small className="profile-multi-helper">{helperText}</small>}
    <details className="profile-multi-select">
      <summary>
        <span>{selected.length ? `${selected.length} selected` : 'Choose options'}</span>
        <small>{selected.length}/{maxItems}</small>
      </summary>
      <div className="profile-multi-search-wrap">
        <Search size={14} aria-hidden="true" />
        <input
          className="profile-multi-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && allowCreate && normalizedQuery && !exactMatch) {
              event.preventDefault();
              createCustom();
            }
          }}
          placeholder={allowCreate ? 'Search or create…' : 'Search options…'}
          aria-label={`Search ${label}`}
        />
      </div>
      <div className="profile-multi-options">
        {filteredOptions.map((option) => {
          const checked = selected.includes(option);
          return <label className="profile-multi-option" key={option}>
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && selected.length >= maxItems}
              onChange={() => toggle(option)}
            />
            <span>{option}</span>
          </label>;
        })}
        {!filteredOptions.length && !(allowCreate && normalizedQuery && !exactMatch) && <div className="profile-multi-empty">No matching options.</div>}
      </div>
      {allowCreate && normalizedQuery && !exactMatch && <button
        type="button"
        className="profile-multi-create"
        disabled={selected.length >= maxItems}
        onClick={createCustom}
      >
        <Plus size={13} /> {createLabel}: “{normalizedQuery}”
      </button>}
    </details>
    {selected.length > 0 && <div className="profile-multi-chips" aria-label={`${label} selections`}>
      {selected.map((item) => <button type="button" key={item} onClick={() => toggle(item)} title={`Remove ${item}`}>
        {item} <span aria-hidden="true">×</span>
      </button>)}
    </div>}
  </div>;
}
