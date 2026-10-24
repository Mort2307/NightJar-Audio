import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { nightjarCalendar, type PersonalCalendarEvent, type UpcomingNightjarRelease } from '../platform/firebase-calendar';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { personalCalendarSavedSelection, validPersonalCalendarDate } from '../platform/calendar-civil-date';
import './personal-calendar.css';

type ReleaseDate = {
  id:string; title?:string; status?:string;
  scheduledAt?:string|null; scheduledTimeZone?:string|null;
  releaseDate?:string|null;
};
type PublishedNightjarRelease = {
  id:string;title:string;creatorName:string;creatorUserId:string;
  releaseDate:string|null;description?:string;category?:string;
  calendarTeaser?:string;audioAvailable?:boolean;playbackAllowed?:boolean;playbackAccessReason?:string;
};
type Props = {role:string;showCreatorReleases?:boolean;simulationMode?:boolean;notify:(message:string)=>void;onOpenStudio?:()=>void;onOpenModeration?:()=>void;
  followingProfileIds?:string[];onOpenPublishedRelease?:(release:PublishedNightjarRelease)=>void};
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const two = (value:number) => String(value).padStart(2,'0');
const dateKey = (year:number,month:number,day:number) => year+'-'+two(month+1)+'-'+two(day);
const dateInZone = (date:Date,zone:string) => {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get = (kind:string) => parts.find((part) => part.type === kind)?.value ?? '';
  return get('year')+'-'+get('month')+'-'+get('day');
};

export default function PersonalCalendar({role,showCreatorReleases=false,simulationMode=false,notify,onOpenStudio,onOpenModeration,followingProfileIds=[],onOpenPublishedRelease}:Props) {
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
  const [timeZone,setTimeZone] = useState('auto');
  const zone = timeZone === 'auto' ? deviceZone : timeZone;
  const [clock,setClock] = useState(() => new Date());
  const [events,setEvents] = useState<PersonalCalendarEvent[]>([]);
  const [upcoming,setUpcoming]=useState<UpcomingNightjarRelease[]>([]);
  const [published,setPublished]=useState<PublishedNightjarRelease[]>([]);
  const [communityError,setCommunityError]=useState('');
  const [publishedError,setPublishedError]=useState('');
  const [communityFilter,setCommunityFilter]=useState<'all'|'following'>('all');
  const [releases,setReleases] = useState<ReleaseDate[]>([]);
  // The personal diary is the only blocking fetch. Community/Creator feeds
  // must never prevent the month grid from becoming usable.
  const [loading,setLoading] = useState(true);
  const [upcomingLoading,setUpcomingLoading] = useState(true);
  const [publishedLoading,setPublishedLoading] = useState(true);
  const [scheduleLoading,setScheduleLoading] = useState(false);
  // Ignore stale responses when a member switches roles or leaves the page.
  const fetchEpoch=useRef(0);
  const [loadError,setLoadError] = useState<string|null>(null);
  const [saving,setSaving] = useState(false);
  // The immediate ref prevents duplicate saves if two taps land before React
  // has disabled the submit button. It also serialises remove and zone writes.
  const operationInFlight = useRef(false);
  const [editing,setEditing] = useState<string|null>(null);
  const [title,setTitle] = useState('');
  const [note,setNote] = useState('');
  const [selected,setSelected] = useState(()=>dateInZone(new Date(),deviceZone));
  // Separate from the currently browsed day: changing an event date while
  // editing must not discard the event ID or accidentally create a duplicate.
  const [draftDate,setDraftDate] = useState(()=>dateInZone(new Date(),deviceZone));
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

  const refresh = () => {
    const epoch=++fetchEpoch.current;
    const active=()=>fetchEpoch.current===epoch;
    setLoadError(null);
    setCommunityError('');
    setPublishedError('');
    setLoading(true);
    setUpcomingLoading(true);
    setPublishedLoading(true);
    const hasSchedule=showCreatorReleases||role==='admin';
    setScheduleLoading(hasSchedule);

    if (simulationMode) {
      setEvents([]);
      setReleases([]);
      setUpcoming([]);
      setPublished([]);
      setLoading(false);
      setUpcomingLoading(false);
      setPublishedLoading(false);
      setScheduleLoading(false);
      return;
    }

    // Start all independent calls immediately. The earlier sequential chain
    // forced the whole page to wait for the slowest three or four roundtrips.
    void nightjarCalendar.get()
      .then(data=>{
        if(!active())return;
        setEvents(data.events);
        setTimeZone(data.timeZone);
      })
      .catch(error=>{
        if(!active())return;
        const message=error instanceof Error?error.message:'Calendar could not load.';
        setLoadError(message);
        notify(message);
      })
      .finally(()=>{if(active())setLoading(false);});

    void nightjarCalendar.upcoming()
      .then(items=>{if(active())setUpcoming(items);})
      .catch(()=>{if(active())setCommunityError('Upcoming releases could not refresh. Your private dates are unaffected.');})
      .finally(()=>{if(active())setUpcomingLoading(false);});

    // Existing protected catalogue; its latency cannot hold the private
    // calendar or the Upcoming feed hostage.
    void nightjarCatalogue.list()
      .then(catalogue=>{
        if(!active())return;
        setPublished((catalogue.catalogue??[]).filter((item:PublishedNightjarRelease & {status?:string})=>
          item.status==='released' && Boolean(item.releaseDate) &&
          Number.isFinite(Date.parse(String(item.releaseDate)))
        ));
      })
      .catch(()=>{if(active())setPublishedError('Published recordings could not refresh. Your private dates are unaffected.');})
      .finally(()=>{if(active())setPublishedLoading(false);});

    if(hasSchedule){
      const request=role==='admin'?nightjarCatalogue.adminAudioLibrary():nightjarCatalogue.dashboard();
      void request
        .then(data=>{
          if(active())setReleases((data.releases??[]).filter((item:ReleaseDate)=>item.scheduledAt||item.releaseDate));
        })
        .catch(()=>{if(active())notify('Your creator release schedule could not refresh; the rest of your calendar remains available.');})
        .finally(()=>{if(active())setScheduleLoading(false);});
    } else {
      setReleases([]);
    }
  };
  useEffect(()=>{
    refresh();
    return ()=>{fetchEpoch.current++;};
  },[role,showCreatorReleases,simulationMode]);

  const today = dateInZone(clock,zone);
  const zoneDate = new Intl.DateTimeFormat('en-GB',{timeZone:zone,dateStyle:'full'}).format(clock);
  const zoneTime = new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeStyle:'short',hourCycle:'h23'}).format(clock);
  const visibleUpcoming=upcoming.filter(item=>communityFilter==='all'||item.isFollowing);
  const visiblePublished=published.filter(item=>communityFilter==='all'||followingProfileIds.includes(item.creatorUserId))
    .sort((a,b)=>String(b.releaseDate).localeCompare(String(a.releaseDate)));
  const entries = useMemo(()=>{
    const items: {id:string;date:string;title:string;kind:'personal'|'release'|'community'|'published';status:string;event?:PersonalCalendarEvent;scheduledTime?:string;announcement?:UpcomingNightjarRelease;publishedRelease?:PublishedNightjarRelease}[] =
      events.map((event)=>({id:event.id,date:event.date,title:event.title,kind:'personal',status:'Personal date',event}));
    const publiclyListedIds=new Set(published.map(item=>item.id));
    for(const release of releases) {
      // Avoid showing the same published release twice for its Creator/Admin.
      if(release.status==='released' && publiclyListedIds.has(release.id))continue;
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
    for(const item of visibleUpcoming) {
      items.push({id:'upcoming-'+item.id,date:dateInZone(new Date(item.scheduledAt),zone),
        title:item.title,kind:'community',status:'Upcoming · '+item.creatorName,
        scheduledTime:new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeStyle:'short',hourCycle:'h23'}).format(new Date(item.scheduledAt)),
        announcement:item});
    }
    for(const release of visiblePublished) {
      if(!release.releaseDate)continue;
      const when=new Date(release.releaseDate);
      if(!Number.isFinite(when.getTime()))continue;
      items.push({
        id:'published-'+release.id,date:dateInZone(when,zone),
        title:release.title||'Untitled release',kind:'published',
        status:'Released · '+(release.creatorName||'NightJar creator'),
        scheduledTime:new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeStyle:'short',hourCycle:'h23'}).format(when),
        publishedRelease:release,
      });
    }
    return items.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
  },[events,releases,upcoming,published,communityFilter,followingProfileIds,zone]);
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
    if(saving || !validPersonalCalendarDate(date))return;
    setSelected(date);
    setDraftDate(date);
    setEditing(null);setTitle('');setNote('');
  };
  const save = async () => {
    if (simulationMode) {notify('Personal calendar changes are disabled in simulation.');return;}
    if (operationInFlight.current || loading || loadError) return;
    if (!title.trim() || !validPersonalCalendarDate(draftDate)) return notify('Choose a real date and enter a title.');
    operationInFlight.current=true;
    setSaving(true);
    try {
      const saved = await nightjarCalendar.save({id:editing ?? undefined,title:title.trim(),date:draftDate,note:note.trim()});
      setEvents((prior)=>[...prior.filter((item)=>item.id!==saved.id),saved]);
      // A moved event is still the same record. Show its new day only AFTER
      // the server confirms the update, and preserve the saved civil date.
      setSelected(saved.date);
      setDraftDate(saved.date);
      const visibleMonth=personalCalendarSavedSelection(saved.date);
      if(visibleMonth)setMonth(visibleMonth);
      setTitle('');setNote('');setEditing(null);
      notify('Date saved to your private Nightjar calendar.');
    } catch(error) {notify(error instanceof Error?error.message:'Could not save date.');}
    finally{operationInFlight.current=false;setSaving(false);}
  };
  const remove = async(id:string)=>{
    if (operationInFlight.current || loading || simulationMode) return;
    if (!window.confirm('Remove this personal calendar date?'))return;
    operationInFlight.current=true;
    setSaving(true);
    try{
      if(!await nightjarCalendar.remove(id))throw Error('Removal was not confirmed.');
      setEvents((prev)=>prev.filter((item)=>item.id!==id));
      if(editing===id){setEditing(null);setTitle('');setNote('');setDraftDate(selected);}
      notify('Personal calendar date removed.');
    }catch(error){notify(error instanceof Error?error.message:'Removal failed.');}
    finally{operationInFlight.current=false;setSaving(false);}
  };
  const saveZone=async(next:string)=>{
    if(simulationMode || loading || operationInFlight.current)return;
    operationInFlight.current=true;
    setSaving(true);
    try{
      const saved = await nightjarCalendar.setTimeZone(next);
      setTimeZone(saved);
      notify('Calendar time zone saved.');
    }catch(error){notify(error instanceof Error?error.message:'Could not save time zone.');}
    finally{operationInFlight.current=false;setSaving(false);}
  };
  return <section className="page-wrap nj-personal-calendar" aria-labelledby="nj-my-calendar-title">
    <div className="nj-calendar-hero">
      <div><span className="mini-label"><CalendarDays size={16}/> YOUR NIGHTJAR · PERSONAL CALENDAR</span>
        <h1 id="nj-my-calendar-title">Make time for what matters.</h1>
        <p>Real dates for your own plans and, when available, your real VA release schedule. Personal notes are private to your account.</p>
      </div>
      <div className="nj-calendar-clock" aria-live="off"><small>YOUR LOCAL DATE AND TIME</small><strong>{zoneTime}</strong><span>{zoneDate}</span><small>{zone}</small></div>
    </div>
    <section className="nj-upcoming-calendar panel" aria-label="Upcoming NightJar premieres">
      <header><div><span className="mini-label">ON THE HORIZON</span><h2>Upcoming on NightJar</h2>
        <p>Approved premieres and published recordings. Drafts, unapproved work and private reminders stay private.</p></div>
        <div className="nj-upcoming-filters" role="group" aria-label="Filter upcoming releases">
          <button type="button" aria-pressed={communityFilter==='all'} className={communityFilter==='all'?'active':''} onClick={()=>setCommunityFilter('all')}>All</button>
          <button type="button" aria-pressed={communityFilter==='following'} className={communityFilter==='following'?'active':''} onClick={()=>setCommunityFilter('following')}>Following</button>
        </div>
      </header>
      {communityError&&<p role="alert" className="nj-calendar-community-error">{communityError}</p>}
      {upcomingLoading?<p className="nj-calendar-community-empty" role="status">Loading approved premieres…</p>:
       visibleUpcoming.length===0?<p className="nj-calendar-community-empty">{communityFilter==='following'?'Nothing announced by the creators you follow yet. Try All.':'No approved upcoming premieres yet. Check back soon.'}</p>:
       <div className="nj-upcoming-list">{visibleUpcoming.slice(0,12).map(item=><button key={item.id} type="button" className="nj-upcoming-item" onClick={()=>{
         const date=dateInZone(new Date(item.scheduledAt),zone),parts=date.split('-').map(Number);
         setMonth({year:parts[0],month:parts[1]-1});chooseDate(date);
         window.requestAnimationFrame(()=>document.querySelector('.nj-calendar-main')?.scrollIntoView({behavior:'smooth',block:'start'}));
       }}>
         <span className="nj-upcoming-date">{new Intl.DateTimeFormat('en-GB',{month:'short',day:'numeric',timeZone:zone}).format(new Date(item.scheduledAt))}</span>
         <span><strong>{item.title}</strong><small>{item.creatorName} · {new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeStyle:'short'}).format(new Date(item.scheduledAt))}{item.isFollowing?' · Following':''}</small>
         {item.teaser&&<em>{item.teaser}</em>}</span>
         <ChevronRight size={17} aria-hidden="true"/>
       </button>)}</div>}
      <div className="nj-published-calendar-head"><strong>Already released</strong><small>Browse published work by its actual release date</small></div>
      {publishedError&&<p role="alert" className="nj-calendar-community-error">{publishedError}</p>}
      {publishedLoading?<p className="nj-calendar-community-empty" role="status">Loading published recordings…</p>:
       visiblePublished.length===0?<p className="nj-calendar-community-empty">{communityFilter==='following'?'No published recordings from followed creators yet. Try All.':'No published recordings to show yet.'}</p>:
       <div className="nj-upcoming-list">{visiblePublished.slice(0,12).map(item=><button key={item.id} type="button" className="nj-upcoming-item" onClick={()=>{
         if(!item.releaseDate)return;
         const date=dateInZone(new Date(item.releaseDate),zone),parts=date.split('-').map(Number);
         setMonth({year:parts[0],month:parts[1]-1});chooseDate(date);
         window.requestAnimationFrame(()=>document.querySelector('.nj-calendar-main')?.scrollIntoView({behavior:'smooth',block:'start'}));
       }}>
         <span className="nj-upcoming-date">{new Intl.DateTimeFormat('en-GB',{month:'short',day:'numeric',timeZone:zone}).format(new Date(item.releaseDate!))}</span>
         <span><strong>{item.title}</strong><small>{item.creatorName} · Published{followingProfileIds.includes(item.creatorUserId)?' · Following':''}</small>
           {item.calendarTeaser&&<em>{item.calendarTeaser}</em>}</span>
         <ChevronRight size={17} aria-hidden="true"/>
       </button>)}</div>}
    </section>
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
      <button type="button" className="secondary-button" disabled={loading||saving} onClick={()=>void refresh()}><RefreshCw size={14}/> Refresh</button>
    </div>
    {loadError && <div className="nj-calendar-error" role="alert"><strong>Calendar couldn't refresh.</strong><span>{loadError} Your existing personal dates have not been changed.</span><button type="button" className="secondary-button" disabled={loading||saving} onClick={()=>void refresh()}>Try again</button></div>}
    {scheduleLoading&&<p className="nj-calendar-community-empty" role="status">Loading your release schedule in the background…</p>}
    <div className="nj-calendar-main">
      <div className="nj-calendar-month panel">
        <header><button type="button" aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft/></button><h2>{monthLabel}</h2><button type="button" aria-label="Next month" onClick={()=>changeMonth(1)}><ChevronRight/></button></header>
        <div className="nj-calendar-grid" role="grid" aria-label={monthLabel}>
          {DAYS.map((day)=><div className="nj-calendar-weekday" key={day} role="columnheader">{day}</div>)}
          {dates.map((date,i)=>date ? <button key={date} type="button" role="gridcell" aria-selected={date===selected} className={['nj-calendar-day',date===today?'today':'',date===selected?'selected':''].filter(Boolean).join(' ')} onClick={()=>chooseDate(date)}>
            <span>{Number(date.slice(-2))}</span>
            {entries.filter((item)=>item.date===date).slice(0,2).map((item)=><small className={item.kind==='release'||item.kind==='community'||item.kind==='published'?'release':''} key={item.id}>{item.title}</small>)}
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
            {entry.announcement?.teaser&&<p>{entry.announcement.teaser}</p>}
            {entry.announcement&&<small>Creator: {entry.announcement.creatorName} · Approved upcoming release · Available to listen after publication</small>}
            {entry.publishedRelease&&<>
              {(entry.publishedRelease.calendarTeaser||entry.publishedRelease.description)&&<p>{entry.publishedRelease.calendarTeaser||entry.publishedRelease.description}</p>}
              {onOpenPublishedRelease&&<button type="button" className="secondary-button" onClick={()=>onOpenPublishedRelease(entry.publishedRelease!)}>Listen to published recording</button>}
            </>}
            {entry.kind==='personal'&&<div><button type="button" className="ghost-button" onClick={()=>{setEditing(entry.id);setDraftDate(entry.date);setTitle(entry.event?.title??'');setNote(entry.event?.note??'');}}>Edit</button><button type="button" className="ghost-button" onClick={()=>void remove(entry.id)} disabled={saving}><Trash2 size={14}/> Remove</button></div>}
          </div>):<p>{loading?'Loading your private calendar dates…':loadError?'Your private dates could not load. Try Refresh.':'No events on this date. Add something you would like to remember.'}</p>}
        </section>
        <section className="panel nj-calendar-form"><h2><Plus size={18}/> {editing?'Edit personal date':'Add a personal date'}</h2>
          <label>Date <input type="date" min="2000-01-01" max="2100-12-31" value={draftDate} disabled={saving} onChange={(event)=>setDraftDate(event.target.value)} /></label>
          <label>Title <input maxLength={120} disabled={saving} value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="Your event title" /></label>
          <label>Notes (optional)<textarea maxLength={1500} disabled={saving} value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Private reminder or details" rows={3}/></label>
          <button type="button" className="primary-button" disabled={saving||loading||Boolean(loadError)||simulationMode||!title.trim()||!validPersonalCalendarDate(draftDate)} onClick={()=>void save()}>{saving?'Saving…':editing?'Save changes':'Add to calendar'}</button>
          {editing&&<button type="button" className="ghost-button" disabled={saving} onClick={()=>{setEditing(null);setDraftDate(selected);setTitle('');setNote('');}}>Cancel editing</button>}
          <small><Clock3 size={12}/> All-day personal dates are saved by date, so travel and clock changes won't shift them. Scheduled audio uses exact publication times.</small>
        </section>
      </aside>
    </div>
  </section>;
}
