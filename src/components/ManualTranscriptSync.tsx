import { useEffect, useRef, useState } from 'react';
import { BookOpenText, Check, Clock3, Copy, RotateCcw } from 'lucide-react';
import './manual-transcript-sync.css';

type Props={initialText?:string;onApply?:(text:string)=>void;label?:string};
const timecode=(seconds:number)=> {
  const value=Math.max(0,Math.floor(seconds));
  const hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),sec=value%60;
  return (hours?String(hours).padStart(2,'0')+':':'')+String(minutes).padStart(2,'0')+':'+String(sec).padStart(2,'0');
};
const secondsFrom=(value:string)=>{
  const parts=value.trim().split(':').map(Number);
  if(parts.length<2||parts.length>3||parts.some(x=>!Number.isInteger(x)||x<0))return null;
  if(parts[parts.length-1]>=60||(parts.length===3&&parts[1]>=60))return null;
  return parts.length===2?parts[0]*60+parts[1]:parts[0]*3600+parts[1]*60+parts[2];
};
const parse=(value:string)=>{
  return value.replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim()).filter(Boolean).slice(0,700).map(line=>{
    const match=line.match(/^\[((?:\d{1,2}:)?\d{1,3}:\d{2})\]\s*(.*)$/);
    return match?{text:match[2],time:match[1]}:{text:line,time:''};
  });
};
const build=(rows:{text:string;time:string}[])=>rows.map(row=>
  (row.time?'['+row.time+'] ':'')+row.text.trim()).join('\n');

/** Human-controlled synchronization. Audio stays in browser memory and is never uploaded. */
export default function ManualTranscriptSync({initialText='',onApply,label='Time a transcript manually'}:Props){
  const audio=useRef<HTMLAudioElement|null>(null);
  const fileUrl=useRef<string|null>(null);
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState(()=>parse(initialText));
  const [source,setSource]=useState(initialText);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const [manualTime,setManualTime]=useState('');
  const [fileName,setFileName]=useState('');
  const [message,setMessage]=useState('');
  const [next,setNext]=useState(0);
  useEffect(()=>()=>{if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);},[]);
  const loadAudio=(file:File|null)=>{
    if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);
    fileUrl.current=null;setFileName('');setDuration(0);setPosition(0);
    if(!file)return;
    if(!file.type.startsWith('audio/') || file.size>250*1024*1024){
      setMessage('Choose a local audio file (250 MB maximum). Nothing is uploaded.');return;
    }
    fileUrl.current=URL.createObjectURL(file);setFileName(file.name);
    if(audio.current)audio.current.src=fileUrl.current;
    setMessage('Local audio loaded on this device only. Press play and stamp lines as you listen.');
  };
  const stamp=(index:number,seconds:number)=>{
    setRows(before=>before.map((row,i)=>i===index?{...row,time:timecode(seconds)}:row));
    setNext(Math.min(rows.length,index+1));
    setMessage('Timestamp added. Check it against the audio before applying.');
  };
  const validate=()=>{
    if(rows.length===0)return 'Add transcript lines first.';
    if(rows.length>700)return 'Too many lines in one sync session.';
    let previous=-1;
    for(const row of rows){
      if(!row.text.trim())return 'A transcript line is empty.';
      if(!row.time)continue;
      const value=secondsFrom(row.time);
      if(value===null)return 'Fix invalid timestamp: '+row.time;
      if(value<previous)return 'Timestamp order must not go backwards.';
      previous=value;
    }
    if(build(rows).length>120000)return 'Transcript exceeds 120,000 characters.';
    return null;
  };
  const apply=async()=>{
    const error=validate();if(error){setMessage(error);return;}
    const value=build(rows);
    if(onApply){onApply(value);setMessage('Timed transcript copied into your draft. Review the text and save the release.');return;}
    try{await navigator.clipboard.writeText(value);setMessage('Timed transcript copied. Paste it into the authorised release transcript field.');}
    catch{setMessage('Clipboard blocked. Select and copy the completed text below.');}
  };
  const output=build(rows);
  return <section className="nj-manual-sync" aria-label={label}>
    <button type="button" className="nj-manual-sync-toggle" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <BookOpenText size={19}/><span><strong>{label}</strong><small>No AI, no third-party services and no automatic audio uploads.</small></span><span aria-hidden="true">⌄</span>
    </button>
    {open&&<div className="nj-manual-sync-body">
      <p>Paste each spoken line on its own row. Use a <strong>local copy</strong> of the finished audio; while it plays, stamp each matching line with the current playback time. You can edit timestamps manually and verify every cue before applying.</p>
      <label htmlFor="nj-sync-source">Untimed lines or an existing timed transcript</label>
      <textarea id="nj-sync-source" rows={6} value={source} maxLength={120000}
        onChange={e=>setSource(e.target.value)} placeholder={'Opening dialogue\n[door closes]\nNext spoken line'}/>
      <button type="button" className="secondary-button" onClick={()=>{setRows(parse(source));setNext(0);setMessage('Lines loaded for manual timing.');}}>
        <RotateCcw size={15}/> Load lines into workshop
      </button>
      <label htmlFor="nj-sync-local-audio">Optional local audio reference (never uploaded)</label>
      <input id="nj-sync-local-audio" type="file" accept="audio/*" onChange={e=>loadAudio(e.target.files?.[0]??null)}/>
      <audio ref={audio} controls preload="metadata" onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} aria-label="Local audio for transcript syncing"/>
      <p className="nj-manual-sync-meta"><Clock3 size={15}/> {fileName||'No reference audio chosen'} · {timecode(position)}{duration>0?' / '+timecode(duration):''}</p>
      <div className="nj-manual-sync-stamper">
        <label htmlFor="nj-sync-manual-time">Manual position (mm:ss, optional)</label>
        <input id="nj-sync-manual-time" value={manualTime} onChange={e=>setManualTime(e.target.value)}
          placeholder={timecode(position)} inputMode="text"/>
        <button type="button" className="primary-button" disabled={next>=rows.length} onClick={()=>{
          const value=manualTime.trim()?secondsFrom(manualTime):position;
          if(value===null){setMessage('Use mm:ss or hh:mm:ss for the manual time.');return;}
          stamp(next,value);
        }}>Stamp next line {next+1}/{rows.length}</button>
      </div>
      <div className="nj-manual-sync-rows" aria-label="Transcript cue timing editor">
        {rows.map((row,index)=><div key={index} className={index===next?'active':''}>
          <label htmlFor={'nj-sync-cue-'+index}>Cue {index+1} · {row.text.slice(0,65)}</label>
          <input id={'nj-sync-cue-'+index} aria-label={'Cue '+(index+1)+' timestamp'} value={row.time}
            placeholder="mm:ss" onChange={e=>setRows(before=>before.map((item,i)=>index===i?{...item,time:e.target.value}:item))}/>
          <button type="button" className="secondary-button" onClick={()=>stamp(index,position)} disabled={!fileName}
            aria-label={'Stamp cue '+(index+1)+' at current audio time'}><Clock3 size={14}/> Stamp now</button>
        </div>)}
        {rows.length===0&&<p>Load a transcript above to start.</p>}
      </div>
      <p>Only timed cues follow the listener's playback position. Untimed paragraphs stay readable but do not auto-synchronise. Human review is required.</p>
      <button type="button" className="primary-button" onClick={()=>void apply()} disabled={!rows.length}>
        {onApply?<Check size={16}/>:<Copy size={16}/>} {onApply?'Apply to release draft':'Copy completed transcript'}
      </button>
      <label htmlFor="nj-sync-finished">Completed timed text · copyable</label>
      <textarea id="nj-sync-finished" rows={6} readOnly value={output} onFocus={e=>e.currentTarget.select()}/>
      {message&&<p role="status" className="nj-manual-sync-message">{message}</p>}
    </div>}
  </section>;
}
