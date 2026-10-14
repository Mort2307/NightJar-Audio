import { CreditCard, Gift, Handshake, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

type Kind = 'membership' | 'wallet' | 'support' | 'licensing';
type Props = { kind:Kind; recipientName?:string; onClose?:()=>void };

const descriptions:Record<Kind,{eyebrow:string;title:string;detail:string;status:string}> = {
  membership:{
    eyebrow:'YOUR NIGHTJAR · MEMBERSHIP',
    title:'A membership that puts listening first.',
    detail:'Membership options and access arrangements are being prepared. You can keep using your existing testing access; no subscription purchase is available here yet.',
    status:'Membership details will be published once Nightjar has finalised its plans.',
  },
  wallet:{
    eyebrow:'YOUR NIGHTJAR · SUPPORT',
    title:'Support the people behind the stories.',
    detail:'Nightjars are being developed as a way to celebrate VA Creators, Writers, Editors and Artists. Your wallet and gift controls will become available once the financial and payment arrangements are approved.',
    status:'Purchases, wallet balances and gifting are not available in this preview.',
  },
  support:{
    eyebrow:'NIGHTJARS · CREATOR SUPPORT',
    title:'Support the creativity you love.',
    detail:'Nightjar is developing a way for listeners to send Nightjars directly to the creative people they follow. For now you can follow their profile, enjoy their work and share it with others.',
    status:'Gifting is not available yet. No payment or transfer will take place.',
  },
  licensing:{
    eyebrow:'SCRIPT RIGHTS · COLLABORATION',
    title:'Discuss scripts. Protect creative rights.',
    detail:'Writers and performers can discover work, request protected samples and start conversations. Financial offers and paid licence execution will be introduced only when the legal and payment framework is approved.',
    status:'No payment terms or paid licence offers can be entered here during testing.',
  },
};

export default function NightjarFinancePreview({kind,recipientName,onClose}:Props) {
  const closeButton=useRef<HTMLButtonElement>(null);
  const content=descriptions[kind];
  useEffect(()=>{
    if(!onClose)return;
    closeButton.current?.focus();
    const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose();}};
    document.addEventListener('keydown',onEscape);
    return()=>document.removeEventListener('keydown',onEscape);
  },[onClose]);
  const Icon=kind==='membership'?CreditCard:kind==='licensing'?Handshake:Gift;
  const section=<div className="nj-finance-preview-content">
    <span className="mini-label"><Icon size={15}/>{content.eyebrow}</span>
    <h3>{content.title}</h3>
    {recipientName&&<p><strong>{recipientName}</strong> is part of the Nightjar creative community.</p>}
    <p>{content.detail}</p>
    <div className="nj-finance-preview-status"><ShieldCheck size={17}/><span>{content.status}</span></div>
  </div>;
  if(!onClose)return <section className="panel nj-finance-preview-card" aria-label={content.eyebrow}>{section}</section>;
  return <div className="nj-finance-preview-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="panel nj-finance-preview-dialog" role="dialog" aria-modal="true" aria-label={content.title}>
      <button ref={closeButton} type="button" className="icon-button nj-finance-preview-close" onClick={onClose} aria-label="Close Nightjar support preview"><X size={19}/></button>
      {section}
      <button type="button" className="secondary-button" onClick={onClose}>Back to Nightjar</button>
    </section>
  </div>;
}
