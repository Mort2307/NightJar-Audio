import { Check, LockKeyhole, Moon, Palette } from 'lucide-react';
import { nightjarThemes } from '../platform/nightjar-theme';

type Props = { simulationMode:boolean; notify:(message:string)=>void };

/**
 * Brand colours are consistent across every member account. Accessibility
 * preferences remain independent via Vision Access in the same Settings menu.
 */
export default function ThemePreferences({ simulationMode }:Props) {
  const brand = nightjarThemes[0];
  return <div className="nj-theme-picker nj-theme-locked">
    <p>NightJar uses one signature appearance across the app. Accessible colour modes, text scaling and reduced motion remain available separately in <strong>Vision Access</strong>.</p>
    <div className="nj-theme-locked-card" aria-label="NightJar appearance: Midnight Gold, active and locked">
      <span className="nj-theme-swatch" aria-hidden="true" style={{background:brand.swatches[0]}}>
        {brand.swatches.map((color,index)=><span key={index} style={{background:color}} />)}
        <Moon size={17}/>
      </span>
      <div className="nj-theme-locked-copy">
        <strong>Midnight Gold <Check size={15} aria-hidden="true"/></strong>
        <small>Obsidian black · champagne gold · warm ivory</small>
        <span>NightJar's official visual identity</span>
      </div>
      <LockKeyhole size={17} aria-hidden="true"/>
    </div>
    <div className="nj-theme-picker-note"><Palette size={15} aria-hidden="true"/><span>{simulationMode ? 'Simulation also uses the official NightJar appearance.' : 'This brand style is fixed. Low-vision colour overrides are still your choice.'}</span></div>
  </div>;
}
