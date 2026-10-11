import { useEffect, useState } from 'react';
import { Check, Palette, Sparkles } from 'lucide-react';
import { nightjarAccessibility } from '../platform/firebase-accessibility';
import { nightjarTheme, nightjarThemes, type NightjarTheme } from '../platform/nightjar-theme';

type Props = { simulationMode:boolean; notify:(message:string)=>void };

export default function ThemePreferences({ simulationMode, notify }:Props) {
  const [selected,setSelected]=useState<NightjarTheme>(()=>nightjarTheme.current());
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if (simulationMode) return;
    let cancelled=false;
    void nightjarAccessibility.get().then((prefs)=>{
      if(cancelled)return;
      const next=prefs.theme??'nocturne';
      setSelected(next);
      nightjarTheme.apply(next);
    }).catch(()=>{/* local theme remains usable offline */});
    return()=>{cancelled=true;};
  },[simulationMode]);

  const choose=async(next:NightjarTheme)=>{
    if(saving||selected===next)return;
    const previous=selected;
    setSelected(next);
    nightjarTheme.apply(next);
    if(simulationMode){notify('Previewing '+nightjarThemes.find(t=>t.id===next)?.label+' locally. No live account preference changed.');return;}
    setSaving(true);
    try {
      const current=await nightjarAccessibility.get();
      const saved=await nightjarAccessibility.save({...current,theme:next});
      setSelected(saved.theme??next);
      nightjarTheme.apply(saved.theme??next);
      notify('Nightjar theme saved to your account.');
    } catch {
      setSelected(previous);
      nightjarTheme.apply(previous);
      notify('Unable to save the theme to your account. Previous appearance restored.');
    } finally {setSaving(false);}
  };

  return <div className="nj-theme-picker">
    <p>Choose a Nightjar atmosphere. All five keep the dark, discreet player and premium editorial look. Your saved choice follows your account across devices.</p>
    <div className="nj-theme-grid" role="group" aria-label="Choose Nightjar theme">
      {nightjarThemes.map((theme)=><button type="button" key={theme.id}
        className={selected===theme.id?'nj-theme-choice selected':'nj-theme-choice'}
        aria-pressed={selected===theme.id} disabled={saving} onClick={()=>void choose(theme.id)}>
        <span className="nj-theme-swatch" style={{background:theme.swatches[0]}}>
          {theme.swatches.map((color,i)=><span key={i} style={{background:color}}/>)}
          {selected===theme.id&&<Check size={16}/>}
        </span>
        <strong>{theme.label}</strong>
        <small>{theme.description}</small>
      </button>)}
    </div>
    <div className="nj-theme-picker-note"><Palette size={15}/><span>{saving?'Saving appearance…':simulationMode?'Role simulation: colours preview locally only.':'Your private account and security settings remain unchanged.'}</span><Sparkles size={14}/></div>
  </div>;
}
