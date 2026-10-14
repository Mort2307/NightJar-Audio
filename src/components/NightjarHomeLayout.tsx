import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, LayoutGrid, RotateCcw, Settings2 } from 'lucide-react';

type SectionId = 'featured' | 'catalogue' | 'recommended' | 'spotlights' | 'writers' | 'trending' | 'creators' | 'studio';
type Layout = { order: SectionId[]; hidden: SectionId[]; collapsed: SectionId[] };
type Preset = 'balanced' | 'discovery' | 'minimal';
const sectionLabels: Record<SectionId, string> = {
  featured: 'Featured listening', catalogue: 'Published audio', recommended: 'For you',
  spotlights: 'Community spotlight', writers: 'Discover writers', trending: 'Trending now',
  creators: 'Creators to follow', studio: 'Creative opportunities',
};
const allSections: SectionId[] = ['featured','catalogue','recommended','spotlights','writers','trending','creators','studio'];
const presets: Record<Preset, Layout> = {
  balanced: { order:['featured','catalogue','recommended','spotlights','creators','writers','trending','studio'], hidden:[], collapsed:['spotlights','writers','trending','studio'] },
  discovery: { order:['recommended','featured','trending','creators','catalogue','spotlights','writers','studio'], hidden:[], collapsed:['writers','studio'] },
  minimal: { order:['featured','catalogue','recommended','spotlights','creators','writers','trending','studio'], hidden:['spotlights','writers','trending','studio'], collapsed:['recommended'] },
};
const copyLayout = (v: Layout): Layout => ({order:[...v.order],hidden:[...v.hidden],collapsed:[...v.collapsed]});
const readLayout = (key: string): Layout => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Partial<Layout> | null;
    if (!saved || !Array.isArray(saved.order)) return copyLayout(presets.balanced);
    const order = [...new Set(saved.order.filter((value): value is SectionId => allSections.includes(value as SectionId))), ...allSections.filter(id => !saved.order?.includes(id))];
    const safe = (items: unknown): SectionId[] => Array.isArray(items) ? items.filter((id): id is SectionId => allSections.includes(id)) : [];
    return {order, hidden:safe(saved.hidden), collapsed:safe(saved.collapsed)};
  } catch { return copyLayout(presets.balanced); }
};
type LayoutContext = { layout: Layout; setLayout: (updater: (current: Layout) => Layout) => void };
const HomeContext = createContext<LayoutContext | null>(null);

export function PersonalisedHome({userId, editable, children, onNavigate}: {
  userId: string; editable: boolean; children: ReactNode; onNavigate: (view: 'library' | 'creators') => void;
}) {
  const key = 'nightjar.home-layout.v1:' + (userId || 'guest');
  const [layout, setSavedLayout] = useState<Layout>(() => readLayout(key));
  const [editing, setEditing] = useState(false);
  useEffect(() => { setSavedLayout(readLayout(key)); setEditing(false); }, [key]);
  const setLayout = (updater: (current: Layout) => Layout) => {
    setSavedLayout(current => {
      const next = updater(current);
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* use the live layout even without storage */ }
      return next;
    });
  };
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<SectionId>).detail;
      if (!allSections.includes(id)) return;
      setLayout(current => ({...current, hidden:current.hidden.filter(item=>item!==id),collapsed:current.collapsed.filter(item=>item!==id)}));
    };
    window.addEventListener('nightjar:open-home-section', open);
    return () => window.removeEventListener('nightjar:open-home-section', open);
  }, [key]);

  const move = (id: SectionId, amount: -1 | 1) => setLayout(current => {
    const order = [...current.order];
    const index = order.indexOf(id), target = index + amount;
    if (index < 0 || target < 0 || target >= order.length) return current;
    [order[index], order[target]] = [order[target], order[index]];
    return {...current,order};
  });
  const toggle = (property: 'hidden' | 'collapsed', id: SectionId) => setLayout(current => ({
    ...current, [property]:current[property].includes(id) ? current[property].filter(value=>value!==id) : [...current[property],id],
  }));
  const ctx = useMemo(() => ({layout,setLayout}), [layout,key]);

  return <HomeContext.Provider value={ctx}>
    <section className="page-wrap nj-animate nj-personal-home" aria-label="Your Nightjar home">
      <div className="nj-personal-home-toolbar">
        <div><span className="mini-label">YOUR NIGHTJAR</span><strong>Made for your listening mood.</strong>
          <small>Your favourite areas, in the order you prefer.</small></div>
        {editable && <button type="button" className="secondary-button" aria-expanded={editing} aria-controls="nj-home-layout-editor" onClick={()=>setEditing(v=>!v)}>
          <Settings2 size={16}/> {editing?'Done arranging':'Customise home'}
        </button>}
      </div>
      {editable && editing && <section id="nj-home-layout-editor" className="nj-home-layout-editor" aria-label="Arrange your home">
        <p>Move sections, hide optional areas or start from a preset. Your layout is saved on this device.</p>
        <div className="nj-home-layout-presets" role="group" aria-label="Homepage layout presets">
          {(['balanced','discovery','minimal'] as Preset[]).map(preset=><button type="button" key={preset} onClick={()=>setLayout(()=>copyLayout(presets[preset]))}>{preset==='balanced'?'Balanced':preset==='discovery'?'Discovery':'Minimal'}</button>)}
        </div>
        <div className="nj-home-layout-rows">{layout.order.map((id,i)=><div className="nj-home-layout-row" key={id}>
          <span>{sectionLabels[id]}</span>
          <button type="button" disabled={i===0} onClick={()=>move(id,-1)} aria-label={'Move '+sectionLabels[id]+' up'}><ArrowUp size={16}/></button>
          <button type="button" disabled={i===layout.order.length-1} onClick={()=>move(id,1)} aria-label={'Move '+sectionLabels[id]+' down'}><ArrowDown size={16}/></button>
          <button type="button" onClick={()=>toggle('hidden',id)} aria-pressed={!layout.hidden.includes(id)}>{layout.hidden.includes(id)?'Show':'Visible'}{!layout.hidden.includes(id)&&<Check size={14}/>}</button>
        </div>)}</div>
        <button type="button" className="ghost-button" onClick={()=>setLayout(()=>copyLayout(presets.balanced))}><RotateCcw size={15}/> Reset home layout</button>
      </section>}
      <nav className="nj-home-shortcuts" aria-label="Quick listening shortcuts">
        <button type="button" onClick={()=>onNavigate('library')}><LayoutGrid size={16}/> My library</button>
        <button type="button" onClick={()=>{
          window.dispatchEvent(new CustomEvent('nightjar:open-home-section',{detail:'catalogue'}));
          window.setTimeout(()=>document.getElementById('nightjar-home-catalogue')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
        }}>Browse audio</button>
        <button type="button" onClick={()=>onNavigate('creators')}>Find creators</button>
      </nav>
      {children}
      {editable && layout.hidden.length > 0 && <button className="nj-home-restore" type="button" onClick={()=>setEditing(true)}>Some sections are hidden · Customise home</button>}
    </section>
  </HomeContext.Provider>;
}

export function HomeSection({id, title, children}: {id: SectionId;title: string;children: ReactNode}) {
  const ctx=useContext(HomeContext);
  if (!ctx) return <>{children}</>;
  const {layout,setLayout}=ctx;
  if(layout.hidden.includes(id)) return null;
  const expanded=!layout.collapsed.includes(id);
  const toggle = () => setLayout(current => ({...current,collapsed:expanded?[...current.collapsed,id]:current.collapsed.filter(item=>item!==id)}));
  return <section className="nj-home-section" id={'nightjar-home-'+id} style={{order:layout.order.indexOf(id)+1}} aria-label={title}>
    <button type="button" className="nj-home-section-toggle" aria-expanded={expanded} onClick={toggle}>
      <span><strong>{title}</strong><small>{expanded?'Tap to tuck this section away':'Tap to explore'}</small></span>
      {expanded?<ChevronUp size={18}/>:<ChevronDown size={18}/>}
    </button>
    {expanded && <div className="nj-home-section-body">{children}</div>}
  </section>;
}

export function WorkspaceSection({userId,sectionId,title,summary,children,defaultOpen=false}:{
  userId:string;sectionId:string;title:string;summary?:string;children:ReactNode;defaultOpen?:boolean;
}) {
  const key='nightjar.workspace-fold.v1:'+userId+':'+sectionId;
  const [open,setOpen]=useState(()=>{
    try {const saved=localStorage.getItem(key);return saved===null?defaultOpen:saved==='open';}catch{return defaultOpen;}
  });
  useEffect(()=>{try {const saved=localStorage.getItem(key);setOpen(saved===null?defaultOpen:saved==='open');}catch{setOpen(defaultOpen)}},[key,defaultOpen]);
  useEffect(() => {
    const reveal = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== sectionId) return;
      setOpen(true);
      try { localStorage.setItem(key,'open'); } catch { /* storage optional */ }
    };
    window.addEventListener('nightjar:open-workspace-section',reveal);
    return () => window.removeEventListener('nightjar:open-workspace-section',reveal);
  },[key,sectionId]);
  const flip=()=>setOpen(previous=>{
    const next=!previous;
    try {localStorage.setItem(key,next?'open':'closed');}catch{ /* optional */ }
    return next;
  });
  return <section className="nj-workspace-fold" aria-label={title}>
    <button type="button" className="nj-workspace-fold-trigger" aria-expanded={open} onClick={flip}>
      <span><strong>{title}</strong>{summary&&<small>{summary}</small>}</span>{open?<ChevronUp size={20}/>:<ChevronDown size={20}/>}
    </button>
    {open&&<div className="nj-workspace-fold-body">{children}</div>}
  </section>;
}
