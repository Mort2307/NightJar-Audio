import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './context-help.css';

/** Central glossary. Use the same precise explanation across all NightJar roles. */
export const NIGHTJAR_HELP = {
  'exclusive-licence': {
    title: 'Exclusive licence',
    description: 'The Writer agrees that only the named licensee may exercise the specified rights for the agreed territory, uses and period. The Writer may also be restricted from using those rights themselves unless the contract reserves that permission.',
    detail: 'Exclusive does not automatically mean buying the copyright. The signed agreement must set out exactly what is exclusive, for how long and where. Discuss the terms before paying.',
  },
  'non-exclusive-licence': {
    title: 'Non-exclusive licence',
    description: 'The VA can use the script for the uses agreed in the licence, but the Writer normally remains free to use it and grant the same rights to other people.',
    detail: 'It does not mean the script is free to use. A signed licence must still specify permitted adaptations, distribution, payment, duration and any restrictions.',
  },
  'licence-choice': {
    title: 'Choosing a licence',
    description: 'Non-exclusive means the Writer can usually license the same rights to others. Exclusive means the specified rights are reserved for one licensee during the agreed term.',
    detail: 'Neither choice transfers copyright by itself. NightJar offers are discussions only until payment and the final agreement are verified.',
  },
  'copyright': {
    title: 'Copyright ownership',
    description: 'Copyright is the legal ownership of original creative work. The Writer generally keeps copyright when licensing a script, unless a separate valid agreement transfers ownership.',
    detail: 'A right to record or distribute an adaptation is different from owning the underlying manuscript.',
  },
  'licence-term': {
    title: 'Licence duration',
    description: 'How long the licensee may use the agreed script rights—for example, 12 months. Specify when the period begins and what happens when it ends.',
    detail: 'A short licence period does not automatically erase recordings already made; the final agreement should say what must be removed or can remain published.',
  },
  'licence-price': {
    title: 'Indicative fee / offer price',
    description: 'A suggested amount for discussion, not a guaranteed purchase price or a payment request.',
    detail: 'NightJar does not currently charge for script rights offers. Funds, taxes, refunds and contract execution are not processed through these negotiation controls.',
  },
  'licence-status': {
    title: 'Offer status',
    description: 'Proposed means waiting for a response. Countered means someone suggested different terms. Declined or withdrawn closes that offer.',
    detail: 'Terms agreed / payment pending is NOT a granted licence. No one may record, copy or publish on this basis alone.',
  },
  'counteroffer': {
    title: 'Counteroffer',
    description: 'A reply proposing different price, duration, exclusivity or usage rights. It is a new set of proposed terms, not acceptance of the previous offer.',
    detail: 'Both sides should check the latest revision before agreeing.',
  },
  'usage-rights': {
    title: 'Intended audio use',
    description: 'Describe exactly what the VA proposes to do: recording, editing, distribution channels, commercial use, territory, and whether further adaptation is allowed.',
    detail: 'The agreed usage description should later appear in the signed licence. An offer is not permission to begin production.',
  },
  'marketplace-visibility': {
    title: 'Marketplace visibility',
    description: 'Private stays off public listings. Invitation only is not publicly discoverable. Marketplace makes an approved synopsis and listing discoverable to eligible NightJar members.',
    detail: 'Changing visibility does not expose the full protected manuscript or grant recording rights.',
  },
  'public-synopsis': {
    title: 'Public synopsis',
    description: 'A short story summary that prospective VAs can read before contacting you. It is visible with your marketplace listing.',
    detail: 'Do not paste private manuscript chapters, unpublished plot surprises or confidential material unless you want them publicly readable.',
  },
  'protected-sample': {
    title: 'Protected script sample',
    description: 'A short excerpt the Writer deliberately selects for verified VAs to preview inside NightJar.',
    detail: 'Only the selected excerpt is shown, not the complete manuscript. Copy restrictions and watermarks help discourage misuse but cannot guarantee prevention of screenshots.',
  },
  'adaptation-approval': {
    title: 'Adaptation approval',
    description: 'The Writer must approve changes that turn the script into a different version, such as rewritten dialogue, new scenes or changed endings, if that condition is included in the final contract.',
    detail: 'Choose whether routine performance changes or major edits require prior written approval.',
  },
  'commercial-use': {
    title: 'Commercial use',
    description: 'Permission to use a work in money-making activity, such as a paid audio release or subscription catalogue.',
    detail: 'It is separate from copyright ownership, exclusivity and adaptation rights; all relevant uses must be covered by the final licence.',
  },
  'withdrawal-terms': {
    title: 'Withdrawal terms',
    description: 'Conditions for ending a licence, such as breach of contract, expiry or agreed early termination.',
    detail: 'Specify what happens to existing recordings, sales and credits if permission ends. Removing a marketplace listing does not automatically cancel a signed agreement.',
  },
  'rights-confirmation': {
    title: 'Ownership and contributor permissions',
    description: 'You confirm that you own the necessary rights or have permission from the people whose creative contributions are included.',
    detail: 'This is a serious declaration. NightJar approval does not independently establish legal ownership.',
  },
  'collaboration-count': {
    title: '🤝 Verified collaborations',
    description: 'The number of completed NightJar collaborations supported by recorded workflow evidence or linked published release credits.',
    detail: 'Tap the 🤝 count to view public work and verified history. Private agreements and messages are never revealed just because a collaboration was counted.',
  },
  'collaboration-status': {
    title: 'Collaboration status',
    description: 'A progress marker for a working relationship, such as interested, discussing, accepted, in production or completed.',
    detail: 'A collaboration marked accepted is not proof of payment or a licence to use a manuscript. Script rights require their own agreement.',
  },
  'protected-reader': {
    title: 'Protected viewer',
    description: 'An in-app, read-only view of a script or Writer-authorised excerpt. It does not grant permission to copy, record, adapt or distribute the material.',
    detail: 'NightJar may log access and use visual watermarks. Browser-level controls cannot stop every screenshot or external camera.',
  },
  'admin-notes': {
    title: 'Private administrator notes',
    description: 'Notes for authorised NightJar administrators working on the same manuscript review. They are not visible to the Writer.',
    detail: 'Choose “Message Writer” when you want the author to see and respond to something.',
  },
  'writer-review': {
    title: 'Manuscript review',
    description: 'NightJar checks a submitted manuscript for marketplace eligibility, rights declarations and listing requirements. It is not an editorial rewriting service.',
    detail: 'An administrator can approve, request changes or reject with an explanation. The original manuscript remains under Writer control.',
  },
  'first-on-nightjar': {
    title: 'First on NightJar',
    description: 'The creator is choosing NightJar as the first place to release this recording.',
    detail: 'It does not make the release exclusive and does not restrict the creator from publishing it elsewhere later. NightJar Original is a separate, commissioned designation.',
  },
  'nightjar-original': {
    title: 'NightJar Original',
    description: 'A release specifically commissioned or paid for by NightJar under its own written agreement.',
    detail: 'Creators cannot grant this designation simply by uploading first. Any exclusivity or ownership depends on the commissioned contract.',
  },
  'transcript': {
    title: 'Optional transcript',
    description: 'Written text accompanying an audio release. The creator can choose whether one is provided.',
    detail: 'It may help people who prefer reading or require accessible alternatives; where provided, it should match the released audio.',
  },
  'verified-status': {
    title: 'Verified and approved',
    description: 'A NightJar team or automated workflow has completed the named review step. The badge only refers to that specific check.',
    detail: 'Approval does not guarantee that external legal rights, identities, quality claims or earnings have been independently verified unless expressly stated.',
  },
  'admin-review-notification': {
    title: 'Administrator action required',
    description: 'A new item is awaiting a decision from an authorised NightJar administrator, such as an application, image or manuscript.',
    detail: 'Already approved items belong in history and should not keep increasing the pending count.',
  },
} as const;

export type HelpTopic = keyof typeof NIGHTJAR_HELP;

type Props = { topic: HelpTopic; className?: string; placement?: 'auto' | 'end' };
export default function ContextHelp({ topic, className = '', placement = 'auto' }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 70 });
  const root = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const id = useId();
  const entry = NIGHTJAR_HELP[topic];

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const wide = window.innerWidth > 680;
      const width = Math.min(340, window.innerWidth - 32);
      const left = placement === 'end' ? rect.right - width : rect.left;
      setPosition({
        left: wide ? Math.max(12, Math.min(left, window.innerWidth - width - 12)) : 12,
        top: rect.bottom + 6,
      });
    };
    update();
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!root.current?.contains(node) && !panel.current?.contains(node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('.nj-context-help-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, placement]);

  return <span ref={root} className={'nj-context-help ' + className}>
    <button type="button" className="nj-context-help-trigger" aria-label={'What does ' + entry.title + ' mean?'}
      aria-expanded={open} aria-controls={open ? id : undefined} title={'Explain: ' + entry.title}
      onClick={(event) => { event.stopPropagation(); setOpen(v => !v); }}>
      <span aria-hidden="true">ℹ️</span>
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <span ref={panel} id={id} className="nj-context-help-panel" role="dialog" aria-modal="false"
        aria-label={'Explanation: ' + entry.title} style={{ left: position.left, top: position.top }}>
        <span className="nj-context-help-top"><strong>{entry.title}</strong><button type="button" className="nj-context-help-close" aria-label="Close explanation"
          onClick={(event) => { event.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLButtonElement>('.nj-context-help-trigger')?.focus(); }}>
          <X size={16}/>
        </button></span>
        <span className="nj-context-help-body">{entry.description}</span>
        <span className="nj-context-help-detail">{entry.detail}</span>
      </span>, document.body)}
  </span>;
}
