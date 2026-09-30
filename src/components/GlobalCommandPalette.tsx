import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

export type NightjarCommand = {
  id: string;
  group: string;
  label: string;
  detail?: string;
  keywords?: string[];
  icon?: ReactNode;
  action: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commands: NightjarCommand[];
};

export default function GlobalCommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const paletteRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useDialogFocusTrap(paletteRef, { active: open, onEscape: onClose, initialFocus: inputRef });

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const ranked = commands.map((command) => {
      if (!term) return { command, score: 1 };
      const label = command.label.toLowerCase();
      const detail = (command.detail ?? '').toLowerCase();
      const keywords = (command.keywords ?? []).join(' ').toLowerCase();
      let score = 0;
      if (label === term) score += 8;
      if (label.startsWith(term)) score += 5;
      if (label.includes(term)) score += 3;
      if (detail.includes(term)) score += 2;
      if (keywords.includes(term)) score += 2;
      return { command, score };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label));
    return ranked.slice(0, 18).map((item) => item.command);
  }, [commands, query]);

  if (!open) return null;

  const choose = (command: NightjarCommand) => {
    command.action();
    onClose();
  };

  return <div className="nj-command-backdrop" role="dialog" aria-modal="true" aria-label="Nightjar search and commands" onMouseDown={onClose}>
    <section ref={paletteRef} tabIndex={-1} className="nj-command-palette" onMouseDown={(event) => event.stopPropagation()}>
      <header className="nj-command-head">
        <Search size={17}/>
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Nightjar, people, releases or tools…" aria-label="Search Nightjar"/>
        <kbd>ESC</kbd>
        <button className="icon-button" onClick={onClose} aria-label="Close search"><X size={16}/></button>
      </header>
      <div className="nj-command-results">
        {results.map((command) => <button key={command.id} className="nj-command-row" onClick={() => choose(command)}>
          <span className="nj-command-icon">{command.icon}</span>
          <span className="nj-command-copy"><strong>{command.label}</strong>{command.detail && <small>{command.detail}</small>}</span>
          <span className="nj-command-group">{command.group}</span>
          <ArrowRight size={14}/>
        </button>)}
        {!results.length && <div className="nj-command-empty"><Search size={20}/><strong>No Nightjar matches.</strong><span>Try a person, release, tag, role or tool name.</span></div>}
      </div>
      <footer><span>Ctrl / ⌘ + K</span><span>Search is limited to content your current account can access.</span></footer>
    </section>
  </div>;
}
