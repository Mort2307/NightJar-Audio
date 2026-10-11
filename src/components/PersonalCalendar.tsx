import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { nightjarCalendar, type PersonalCalendarEvent } from '../platform/firebase-calendar';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import './personal-calendar.css';

type ReleaseDate = {
  id:string; title?:string; status?:string;
  scheduledAt?:string|null; scheduledTimeZone?:string|null;
  releaseDate?:string|null;
};
type Props = { role: string; showCreatorReleases?:boolean; simulationMode?:boolean; notify:(message:string)=>void; onOpenStudio?:()=>void; onOpenModeration?:()=>void };
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const two = (value:number) => String(value).padStart(2,'0');
const dateKey = (year:number,month:number,day:number) => year+'-'+two(month+1)+'-'+two(day);
const dateInZone = (date:Date,zone:string) => {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get = (kind:string) => parts.find((part) => part.type === kind)?.value ?? '';
  return get('year')+'-'+get('month')+'-'+get('day');
};
const validDateKey = (date:string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date+'T12:00:00Z').getTime());

export default function PersonalCalendar({role,showCreatorReleases=false,simulationMode=false,notify,onOpenStudio,onOpenModeration}:Props) {
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
  const [timeZone,setTimeZone] = useState('auto');
  const zone = timeZone === 'auto' ? deviceZone : timeZone;
  const [clock,setClock] = useState(() => new Date());
  const [events,setEvents] = useState<PersonalCalendarEvent[]>([]);
  const [releases,setReleases] = useState<ReleaseDate[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [editing,setEditing] = useState<string|null>(null);
  const [title,setTitle] = useState('');
  const [note,setNote] = useState('');
  const [selected,setSelected] = useState(()=>dateInZone(new Date(),deviceZone));
  const [month,setMonth] = useState(()=>{
    const now=dateInZone(new Date(),deviceZone).split('-').map(Number);
    return {year:now[0],month:now[1]-1};
  });

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()),30000);
    const onVisible = () => setClock(new Date());
    document.addEventListener('visibilitychange',onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange',onVisible); };
  },[]);

  const refresh = async () => {
    setLoading(true);
    try {
      if (simulationMode) {
        setEvents([]);
        setReleases([]);
        return;
      }
      const data = await nightjarCalendar.get();
      setEvents(data.events);
      setTimeZone(data.timeZone);
      if (showCreatorReleases || role === 'admin') {
        const data = role === 'admin' ? await nightjarCatalogue.adminAudioLibrary() : await nightjarCatalogue.dashboard();
        setReleases((data.releases??[]).filter((item:ReleaseDate)=>item.scheduledAt || item.releaseDate));
      } else setReleases([]);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Calendar could not load.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); },[role,showCreatorReleases,simulationMode]);

  const today = dateInZone(clock,zone);
  const zoneDate = new Intl.DateTimeFormat('en-GB',{timeZone:zone,dateStyle:'full'}).format(clock);
  const zoneTime = new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeStyle:'short',hourCycle:'h23'}).format(clock);
  const entries = useMemo(()=>{
    const items: {id:string;date:string;title:string;kind:'personal'|'release';status:string;event?:PersonalCalendarEvent;scheduledTime?:string}[] =
      events.map((event)=>({id:event.id,date:event.date,title:event.title,kind:'personal',status:'Personal date',event}));
    for(const release of releases) {
      if (!release.scheduledAt && !release.releaseDate) continue;
      const instant = release.scheduledAt ?? release.releaseDate;
      if (!instant || Number.isNaN(Date.parse(instant))) continue;
      const effectiveDate = release.status === 'released' && release.releaseDate ? release.releaseDate : instant;
      items.push({
        id:'release-'+release.id,date:dateInZone(new Date(effectiveDate),zone),
        title:release.title || 'Untitled release',kind:'release',
        status:release.status === 'scheduled' ? 'Approved · Scheduled' : release.status === 'pending_review' ? 'Awaiting approval' : release.status === 'released' ? 'Published' : 'Planned · Not submitted',
        scheduledTime:new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeStyle:'short',hourCycle:'h23'}).format(new Date(instant)),
      });
    }
    return items.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
  },[events,releases,zone]);
  const monthLabel = new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(month.year,month.month,1)));
  const first = (new Date(Date.UTC(month.year,month.month,1)).getUTCDay()+6)%7;
  const total = new Date(Date.UTC(month.year,month.month+1,0)).getUTCDate();
  const dates = Array.from({length:Math.ceil((first+total)/7)*7},(_,i)=>{
    const d = i-first+1;
    return d>=1&&d<=total?dateKey(month.year,month.month,d):null;
  });
  const selectedEntries = entries.filter((item)=>item.date===selected);

  const changeMonth=(distance:number)=>{
    const next = new Date(Date.UTC(month.year,month.month+distance,1));
    setMonth({year:next.getUTCFullYear(),month:next.getUTCMonth()});
  };
  const chooseDate=(date:string)=>{
    setSelected(date);
    setEditing(null);setTitle('');setNote('');
  };
  const save = async () => {
    if (simulationMode) {notify('Personal calendar changes are disabled in simulation.');return;}
    if (!title.trim() || !validDateKey(selected)) return notify('Choose a valid date and enter a title.');
    setSaving(true);
    try {
      const saved = await nightjarCalendar.save({id:editing ?? undefined,title:title.trim(),date:selected,note:note.trim()});
      setEvents((prior)=>[...prior.filter((item)=>item.id!==saved.id),saved]);
      setTitle('');setNote('');setEditing(null);
      notify('Date saved to your private Nightjar calendar.');
    } catch(error) {notify(error instanceof Error?error.message:'Could not save date.');}
    finally{setSaving(false);}
  };
  const remove = async(id:string)=>{
    if (!window.confirm('Remove this personal calendar date?'))return;
    setSaving(true);
    try{
      if(!await nightjarCalendar.remove(id))throw Error('Removal was not confirmed.');
      setEvents((prev)=>prev.filter((item)=>item.id!==id));
      setEditing(null);setTitle('');setNote('');
      notify('Personal calendar date removed.');
    }catch(error){notify(error instanceof Error?error.message:'Removal failed.');}
    finally{setSaving(false);}
  };
  const saveZone=async(next:string)=>{
    if(simulationMode)return;
    setSaving(true);
    try{
      const saved = await nightjarCalendar.setTimeZone(next);
      setTimeZone(saved);
      notify('Calendar time zone saved.');
    }catch(error){notify(error instanceof Error?error.message:'Could not save time zone.');}
    finally{setSaving(false);}
  };
  return <section className="page-wrap nj-personal-calendar" aria-labelledby="nj-my-calendar-title">
    <div className="nj-calendar-hero">
      <div><span className="mini-label"><CalendarDays size={16}/> YOUR NIGHTJAR · PERSONAL CALENDAR</span>
        <h1 id="nj-my-calendar-title">Make time for what matters.</h1>
        <p>Real dates for your own plans and, when available, your real VA release schedule. Personal notes are private to your account.</p>
      </div>
      <div className="nj-calendar-clock" aria-live="off"><small>YOUR LOCAL DATE AND TIME</small><strong>{zoneTime}</strong><span>{zoneDate}</span><small>{zone}</small></div>
    </div>
    {showCreatorReleases && <div className="nj-calendar-role-shortcut"><strong>Planning an audio premiere?</strong><span>Choose the publication date and time when you prepare your recording; Nightjar will review it immediately but publish only when scheduled.</span><button className="primary-button" type="button" onClick={onOpenStudio}>Open VA Studio</button></div>}
    {role === 'admin' && <div className="nj-calendar-role-shortcut"><strong>Nightjar's approved release schedule</strong><span>Upcoming release dates shown here remain private until publication. Review new submissions in the moderation queue.</span><button className="secondary-button" type="button" onClick={onOpenModeration}>Open audio moderation</button></div>}
    <div className="nj-calendar-toolbar">
      <label>Time zone
        <select value={timeZone} disabled={saving||simulationMode} onChange={(event)=>void saveZone(event.target.value)}>
          <option value="auto">Use my device ({deviceZone})</option>
          {Array.from(new Set([deviceZone,'Europe/London','Europe/Dublin','Europe/Paris','America/New_York','America/Los_Angeles','America/Chicago','America/Toronto','Australia/Sydney','Asia/Tokyo','Asia/Dubai','Asia/Kolkata'])).filter((item)=>item!==deviceZone||timeZone!=='auto').map((item)=><option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <button type="button" className="secondary-button" onClick={()=>{const parts=today.split('-').map(Number);setMonth({year:parts[0],month:parts[1]-1});chooseDate(today);}}>Today</button>
      <button type="button" className="secondary-button" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={14}/> Refresh</button>
    </div>
    <div className="nj-calendar-main">
      <div className="nj-calendar-month panel">
        <header><button type="button" aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft/></button><h2>{monthLabel}</h2><button type="button" aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight/></button></header>
        <div className="nj-calendar-grid" role="grid" aria-label={monthLabel}>
          {DAYS.map((day)=><div className="nj-calendar-weekday" key={day} role="columnheader">{day}</div>)}
          {dates.map((date,i)=>date ? <button key={date} type="button" role="gridcell" aria-selected={date===selected} className={['nj-calendar-day',date===today?'today':'',date===selected?'selected':''].filter(Boolean).join(' ')} onClick={()=>chooseDate(date)}>
            <span>{Number(date.slice(-2))}</span>
            {entries.filter((item)=>item.date===date).slice(0,2).map((item)=><small className={item.kind==='release'?'release':''} key={item.id}>{item.title}</small>)}
            {entries.filter((item)=>item.date===date).length>2&&<em>+{entries.filter((item)=>item.date===date).length-2} more</em>}
          </button> : <span className="nj-calendar-empty" role="gridcell" key={'empty-'+i}/>)}
        </div>
      </div>
      <aside className="nj-calendar-sidebar">
        <section className="panel nj-calendar-selected">
          <h2>{new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',dateStyle:'full'}).format(new Date(selected+'T12:00:00Z'))}</h2>
          {selectedEntries.length ? selectedEntries.map((entry)=><div className="nj-calendar-entry" key={entry.id}>
            <strong>{entry.title}</strong><small>{entry.status}{entry.scheduledTime?' · '+entry.scheduledTime:''}</small>
            {entry.event?.note&&<p>{entry.event.note}</p>}
            {entry.kind==='personal'&&<div><button type="button" className="ghost-button" onClick={()=>{setEditing(entry.id);setTitle(entry.event?.title??'');setNote(entry.event?.note??'');}}>Edit</button><button type="button" className="ghost-button" onClick={()=>void remove(entry.id)} disabled={saving}><Trash2 size={14}/> Remove</button></div>}
          </div>):<p>No events on this date. Add something you'd like to remember.</p>}
        </section>
        <section className="panel nj-calendar-form"><h2><Plus size={18}/> {editing?'Edit personal date':'Add a personal date'}</h2>
          <label>Date <input type="date" value={selected} onChange={(event)=>{if(validDateKey(event.target.value))chooseDate(event.target.value);}} /></label>
          <label>Title <input maxLength={120} value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="Your event title" /></label>
          <label>Notes (optional)<textarea maxLength={1500} value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Private reminder or details" rows={3}/></label>
          <button type="button" className="primary-button" disabled={saving||loading||simulationMode||!title.trim()} onClick={()=>void save()}>{saving?'Saving…':editing?'Save changes':'Add to calendar'}</button>
          {editing&&<button type="button" className="ghost-button" onClick={()=>{setEditing(null);setTitle('');setNote('');}}>Cancel editing</button>}
          <small><Clock3 size={12}/> All-day personal dates are saved by date, so travel and clock changes won't shift them. Scheduled audio uses exact publication times.</small>
        </section>
      </aside>
    </div>
  </section>;
}
