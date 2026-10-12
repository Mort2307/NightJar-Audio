import { useEffect, useRef, useState } from 'react';
import { Accessibility, Eye, RotateCcw, X } from 'lucide-react';
import { nightjarAuth } from '../platform/firebase-auth';
import { DEFAULT_VISION, nightjarVision, VISION_MODES, VISION_SIZES, type VisionMode, type VisionSize } from '../platform/nightjar-vision';

/** The exact same accessible controls are usable in Settings and without signing in. */
export function VisionAccessControls() {
  const [prefs, setPrefs] = useState(() => nightjarVision.current());
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    const changed = () => setPrefs(nightjarVision.current());
    window.addEventListener('nightjar:vision-change', changed);
    window.addEventListener('storage', changed);
    return () => {
      window.removeEventListener('nightjar:vision-change', changed);
      window.removeEventListener('storage', changed);
    };
  }, []);

  const change = (next: typeof prefs) => {
    setPrefs(next);
    setStorageWarning(!nightjarVision.apply(next));
  };
  const chooseMode = (mode: VisionMode) => change({ ...prefs, mode });
  const chooseSize = (size: VisionSize) => change({ ...prefs, textSize: size });

  return <div className="nj-vision-controls">
    <p className="nj-vision-help">Choose what is easiest for <strong>you</strong> to read. Changes preview instantly. These preferences stay on this device and do not change your account or professional roles.</p>
    <fieldset className="nj-vision-fieldset">
      <legend>Display colours</legend>
      <div className="nj-vision-mode-grid">
        {VISION_MODES.map(mode => <button key={mode.id} type="button"
          className={prefs.mode === mode.id ? 'nj-vision-mode is-selected' : 'nj-vision-mode'}
          aria-pressed={prefs.mode === mode.id} onClick={() => chooseMode(mode.id)}>
          <span className="nj-vision-swatches" aria-hidden="true" style={{ background: mode.swatches[0] }}>
            <i style={{ background: mode.swatches[1] }}/><i style={{ background: mode.swatches[2] }}/>
          </span>
          <strong>{mode.label}</strong>
          <small>{mode.description}</small>
        </button>)}
      </div>
    </fieldset>
    <fieldset className="nj-vision-fieldset">
      <legend>Enlarge the whole interface</legend>
      <p>Text, menus, buttons and playback controls grow together. You can still use your phone's magnification settings.</p>
      <div className="nj-vision-size-grid" role="group" aria-label="Interface enlargement">
        {VISION_SIZES.map(size => <button type="button" key={size}
          aria-pressed={prefs.textSize === size}
          className={prefs.textSize === size ? 'nj-vision-size is-selected' : 'nj-vision-size'}
          onClick={() => chooseSize(size)}>{size}%</button>)}
      </div>
    </fieldset>
    <label className="nj-vision-quiet">
      <input type="checkbox" checked={prefs.quiet} onChange={event => change({ ...prefs, quiet: event.target.checked })}/>
      <span><strong>Reduce motion and visual effects</strong><small>Remove animated backgrounds, movement and decorative glows.</small></span>
    </label>
    <button type="button" className="nj-vision-reset" onClick={() => change({ ...DEFAULT_VISION })}>
      <RotateCcw size={17} aria-hidden="true"/> Reset vision preferences
    </button>
    <p className="nj-vision-footnote" role="status">{storageWarning
      ? 'Settings are active for this session, but this browser blocked device storage.'
      : 'Applied immediately · Saved on this device when local storage is available'}</p>
  </div>;
}

export default function VisionAccessLauncher() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  // Only show an entry shortcut while signed out. After sign-in the full
  // controls live in Settings → Accessibility, not over the player or menus.
  // Wait for Firebase to hydrate so an existing session never flashes a button.
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => nightjarAuth.observe(identity => setSignedOut(identity === null)), []);
  const open = () => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    setOpened(true);
  };
  const close = () => {
    dialog.current?.close();
    setOpened(false);
  };
  if (!signedOut) return null;

  return <>
    <button type="button" className="nj-vision-launcher" onClick={open}
      aria-label="Accessibility: adjust Nightjar display" title="Accessibility"
      aria-haspopup="dialog" aria-expanded={opened} aria-controls="nj-vision-dialog">
      <Accessibility size={18} aria-hidden="true"/><span>Accessibility</span>
    </button>
    <dialog id="nj-vision-dialog" ref={dialog} className="nj-vision-dialog" aria-labelledby="nj-vision-title"
      onClose={() => setOpened(false)}>
      <header className="nj-vision-dialog-head">
        <div><span className="nj-vision-overline"><Eye size={17} aria-hidden="true"/> NIGHTJAR ACCESSIBILITY</span>
          <h2 id="nj-vision-title">Make Nightjar clearer.</h2>
        </div>
        <button type="button" className="nj-vision-close" onClick={close} aria-label="Close display options"><X size={22}/></button>
      </header>
      <VisionAccessControls />
      <button type="button" className="nj-vision-done" onClick={close}>Done</button>
    </dialog>
  </>;
}
