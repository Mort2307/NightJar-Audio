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
  const [customValue, setCustomValue] = useState('');
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

  const addCustomValue = (rawValue: string, clear: () => void) => {
    if (!allowCreate || selected.length >= maxItems) return;
    const cleaned = tidy(rawValue);
    if (!cleaned) return;

    const existing = allOptions.find(
      (option) => option.toLocaleLowerCase() === cleaned.toLocaleLowerCase(),
    );
    const valueToAdd = existing ?? cleaned;
    const alreadySelected = selected.some(
      (value) => value.toLocaleLowerCase() === valueToAdd.toLocaleLowerCase(),
    );

    if (!alreadySelected) onChange([...selected, valueToAdd]);
    clear();
  };

  const createCustom = () => {
    if (!allowCreate || !normalizedQuery || exactMatch || selected.length >= maxItems) return;
    addCustomValue(normalizedQuery, () => setQuery(''));
  };

  const normalizedCustomValue = tidy(customValue);
  const customMatchesExisting = normalizedCustomValue
    ? allOptions.some((option) => option.toLocaleLowerCase() === normalizedCustomValue.toLocaleLowerCase())
    : false;
  const customAlreadySelected = normalizedCustomValue
    ? selected.some((option) => option.toLocaleLowerCase() === normalizedCustomValue.toLocaleLowerCase())
    : false;

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
    {allowCreate && <div className="profile-custom-tag-create">
      <div className="profile-custom-tag-input-wrap">
        <Plus size={14} aria-hidden="true" />
        <input
          value={customValue}
          onChange={(event) => setCustomValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && normalizedCustomValue && !customAlreadySelected) {
              event.preventDefault();
              addCustomValue(customValue, () => setCustomValue(''));
            }
          }}
          placeholder="Type a custom tag…"
          aria-label={\`Add custom \${label}\`}
          maxLength={48}
        />
      </div>
      <button
        type="button"
        disabled={!normalizedCustomValue || customAlreadySelected || selected.length >= maxItems}
        onClick={() => addCustomValue(customValue, () => setCustomValue(''))}
      >
        <Plus size={13} aria-hidden="true" />
        {customMatchesExisting ? 'Add tag' : createLabel}
      </button>
    </div>}
    {allowCreate && <small className="profile-custom-tag-note">Custom tags can be up to 48 characters. Add anything useful that is missing from the standard list.</small>}
    {selected.length > 0 && <div className="profile-multi-chips" aria-label={`${label} selections`}>
      {selected.map((item) => <button type="button" key={item} onClick={() => toggle(item)} title={`Remove ${item}`}>
        {item} <span aria-hidden="true">×</span>
      </button>)}
    </div>}
  </div>;
}
