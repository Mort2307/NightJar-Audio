import { useMemo, useState } from 'react';
import { BadgeCheck, BookOpen, Check, ChevronRight, CircleDollarSign, Eye, EyeOff, FileCheck2, Headphones, Mic2, Pencil, ShieldCheck, SlidersHorizontal, UsersRound } from 'lucide-react';
import './admin-systems-preview.css';

type PreviewTab = 'profiles' | 'commitments' | 'compensation';
const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

const profileTypes = [
  { id: 'listener', label: 'Listener', detail: 'Taste, favourites and community presence', icon: Headphones, status: 'Active' },
  { id: 'creator', label: 'VA Creator', detail: 'Voice, performance and recording craft', icon: Mic2, status: 'Approved role required' },
  { id: 'writer', label: 'Writer', detail: 'Writing voice, formats and portfolio', icon: BookOpen, status: 'Approved role required' },
  { id: 'editor', label: 'Audio Editor', detail: 'Production services and delivery skills', icon: SlidersHorizontal, status: 'Approved role required' },
  { id: 'artist', label: 'Artist', detail: 'Medium, style and commission portfolio', icon: Pencil, status: 'Approved role required' },
];

export default function AdminSystemsPreview() {
  const [tab, setTab] = useState<PreviewTab>('profiles');
  const [visible, setVisible] = useState<Record<string, boolean>>({ listener: true, creator: true, writer: false, editor: false, artist: false });
  const [creatorPercent, setCreatorPercent] = useState(50);
  const [nightjarPercent, setNightjarPercent] = useState(30);
  const [ownerPercent, setOwnerPercent] = useState(20);
  const [subscriptionPrice, setSubscriptionPrice] = useState('6.99');
  const [taxReserve, setTaxReserve] = useState(15);
  const [periodRevenue, setPeriodRevenue] = useState('1000');
  const [showTaxDetail, setShowTaxDetail] = useState(false);

  const allocationTotal = creatorPercent + nightjarPercent + ownerPercent;
  const sampleNetPence = Math.max(0, Math.round((Number(periodRevenue) || 0) * 100));
  const creatorPoolPence = Math.round(sampleNetPence * creatorPercent / 100);
  const sampleCreatorCount = 5;
  const sharePence = Math.floor(creatorPoolPence / sampleCreatorCount);
  const taxReservePence = Math.round(sampleNetPence * nightjarPercent / 100 * taxReserve / 100);
  const allocations = useMemo(() => [
    { label: 'Creator Pool', percent: creatorPercent, amount: Math.round(sampleNetPence * creatorPercent / 100) },
    { label: 'Nightjar operating pool', percent: nightjarPercent, amount: Math.round(sampleNetPence * nightjarPercent / 100) },
    { label: 'Meg & Mike pool', percent: ownerPercent, amount: Math.round(sampleNetPence * ownerPercent / 100) },
  ], [creatorPercent, nightjarPercent, ownerPercent, sampleNetPence]);

  const setAllocation = (key: 'creator' | 'nightjar' | 'owner', value: number) => {
    const next = Math.max(0, Math.min(100, value));
    if (key === 'creator') {
      setCreatorPercent(next);
      setNightjarPercent(Math.max(0, 100 - next - ownerPercent));
    } else if (key === 'nightjar') {
      setNightjarPercent(next);
      setOwnerPercent(Math.max(0, 100 - creatorPercent - next));
    } else {
      setOwnerPercent(next);
      setNightjarPercent(Math.max(0, 100 - creatorPercent - next));
    }
  };

  return <section className="nj-systems-preview" aria-label="Nightjar three-system preview">
    <header className="nj-systems-preview-head">
      <div>
        <span className="mini-label">NIGHTJAR / SYSTEMS PREVIEW</span>
        <h2>Three systems. One connected studio.</h2>
        <p>Review the proposed experience before it is connected to production data.</p>
      </div>
      <span className="nj-preview-only"><Eye size={14}/> PREVIEW ONLY</span>
    </header>

    <nav className="nj-systems-tabs" aria-label="Preview systems">
      <button type="button" aria-pressed={tab === 'profiles'} className={tab === 'profiles' ? 'active' : ''} onClick={() => setTab('profiles')}><UsersRound size={16}/> Profile types</button>
      <button type="button" aria-pressed={tab === 'commitments'} className={tab === 'commitments' ? 'active' : ''} onClick={() => setTab('commitments')}><FileCheck2 size={16}/> Commitments</button>
      <button type="button" aria-pressed={tab === 'compensation'} className={tab === 'compensation' ? 'active' : ''} onClick={() => setTab('compensation')}><CircleDollarSign size={16}/> Compensation</button>
    </nav>

    {tab === 'profiles' && <div className="nj-systems-body">
      <div className="nj-preview-section-title"><div><span className="mini-label">ONE ACCOUNT / DISTINCT CREATIVE IDENTITIES</span><h3>Manage profile types</h3><p>Each profile has its own presentation and visibility. Professional approval remains separate.</p></div><button type="button" className="nj-gold-button" onClick={() => setVisible((current) => ({ ...current, writer: true }))}>+ Add profile type</button></div>
      <div className="nj-profile-type-list">{profileTypes.map(({ id, label, detail, icon: Icon, status }) => <article className="nj-profile-type-row" key={id}>
        <span className="nj-profile-type-icon"><Icon size={19}/></span>
        <div className="nj-profile-type-copy"><strong>{label}</strong><span>{detail}</span><small>{status}</small></div>
        <span className="nj-profile-visibility">{visible[id] ? <Eye size={15}/> : <EyeOff size={15}/>} {visible[id] ? 'Visible' : 'Hidden'}</span>
        <button type="button" className="nj-icon-action" aria-label={(visible[id] ? 'Hide ' : 'Show ') + label + ' profile'} onClick={() => setVisible((current) => ({ ...current, [id]: !current[id] }))}>{visible[id] ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
        <ChevronRight size={17} className="nj-muted-chevron"/>
      </article>)}</div>
      <div className="nj-preview-note"><ShieldCheck size={17}/><span><strong>Approval boundary stays intact.</strong> Adding a profile does not grant a professional workspace, creator badge, marketplace access or compensation eligibility.</span></div>
    </div>}

    {tab === 'commitments' && <div className="nj-systems-body">
      <div className="nj-preview-section-title"><div><span className="mini-label">ASSESSMENT PERIOD / NOVEMBER 2026</span><h3>Commitment tracker</h3><p>Progress is assessed separately for each approved creative role.</p></div><span className="nj-period-chip">Monthly cycle</span></div>
      <div className="nj-commitment-summary"><div><span>Overall progress</span><strong>4 of 5</strong><small>Mandatory commitments approved</small></div><div><span>Qualifying roles</span><strong>1</strong><small>Writer · 100% complete</small></div><div><span>Next due date</span><strong>12 Nov</strong><small>Audio delivery milestone</small></div></div>
      <div className="nj-role-progress-list">
        <article><div className="nj-role-progress-heading"><span><BookOpen size={17}/> Writer</span><strong className="complete">100% · Eligible</strong></div><div className="nj-progress-track"><span style={{ width: '100%' }}/></div><ul><li><Check size={14}/> Monthly writing contribution approved</li><li><Check size={14}/> Editorial review completed</li></ul></article>
        <article><div className="nj-role-progress-heading"><span><Mic2 size={17}/> VA Creator</span><strong>75% · In progress</strong></div><div className="nj-progress-track"><span style={{ width: '75%' }}/></div><ul><li><Check size={14}/> Recording brief accepted</li><li><Check size={14}/> First delivery approved</li><li className="pending">○ Final revision due 12 November</li></ul></article>
      </div>
      <div className="nj-preview-note"><ShieldCheck size={17}/><span><strong>One approved role is enough.</strong> A member who completes 100% of Writer commitments qualifies, even if their Creator commitments are still in progress. They receive one share, not two.</span></div>
    </div>}

    {tab === 'compensation' && <div className="nj-systems-body">
      <div className="nj-preview-section-title"><div><span className="mini-label">FINANCE / ILLUSTRATIVE FIGURES ONLY</span><h3>Compensation control centre</h3><p>Adjust the model and inspect how the allocations reconcile. No billing or payout action is connected.</p></div><span className="nj-period-chip">Sandbox data</span></div>
      <div className="nj-finance-controls">
        <label>Monthly subscription reference (£)<input inputMode="decimal" value={subscriptionPrice} onChange={(event) => setSubscriptionPrice(event.target.value)} /></label>
        <label>Illustrative eligible net revenue (£)<input inputMode="decimal" value={periodRevenue} onChange={(event) => setPeriodRevenue(event.target.value)} /></label>
      </div>
      <div className="nj-finance-allocation">
        <div className="nj-finance-allocation-head"><span className="mini-label">REVENUE ALLOCATION</span><strong className={allocationTotal === 100 ? 'valid' : 'invalid'}>{allocationTotal}% / 100%</strong></div>
        {[{key:'creator' as const,label:'Creator Pool',value:creatorPercent},{key:'nightjar' as const,label:'Nightjar operating pool',value:nightjarPercent},{key:'owner' as const,label:'Meg & Mike pool',value:ownerPercent}].map((item) => <label className="nj-allocation-row" key={item.key}><span>{item.label}</span><input type="number" min="0" max="100" value={item.value} onChange={(event) => setAllocation(item.key, Number(event.target.value))}/><span>%</span><div className="nj-allocation-track"><span style={{ width: item.value + '%' }}/></div></label>)}
        {allocationTotal !== 100 && <p className="nj-inline-warning">Allocations must total exactly 100% before a policy can be saved.</p>}
      </div>
      <p className="nj-preview-note"><ShieldCheck size={17}/><span><strong>Allocation placeholders, not an agreed owner policy.</strong> The 50% Creator Pool is the agreed starting point. The displayed 30% Nightjar / 20% Meg & Mike split is illustrative and must be confirmed before any live policy is saved. The founders’ 50/50 ownership is separate from this monthly cash allocation.</span></p>\n      <div className="nj-finance-outcomes">
        {allocations.map((item) => <div key={item.label}><span>{item.label}</span><strong>{money(item.amount)}</strong><small>{item.percent}% of eligible net revenue</small></div>)}
      </div>
      <div className="nj-creator-share-panel"><div><span className="mini-label">EQUAL CREATOR SHARES</span><h4>{money(sharePence)} <small>/ person</small></h4><p>Illustration: {money(creatorPoolPence)} divided between 5 eligible individuals. Multi-role members count once.</p></div><UsersRound size={25}/></div>
      <div className="nj-tax-reserve">
        <button type="button" onClick={() => setShowTaxDetail((value) => !value)} aria-expanded={showTaxDetail}><span><ShieldCheck size={17}/> Tax reserve illustration</span><strong>{money(taxReservePence)}</strong><ChevronRight size={16}/></button>
        {showTaxDetail && <div className="nj-tax-reserve-detail"><label>Reserve percentage of Nightjar pool<input type="number" min="0" max="100" value={taxReserve} onChange={(event) => setTaxReserve(Math.max(0, Math.min(100, Number(event.target.value))))}/>%</label><p>The 15% control is a sandbox placeholder only, not a Nightjar tax rate or confirmed reserve rule. The reserve waterfall and accountant-approved tax treatment remain undecided. Actual tax payments must be recorded separately against the relevant tax period.</p></div>}
      </div>
      <div className="nj-preview-note"><ShieldCheck size={17}/><span><strong>Live finance stays locked until reviewed.</strong> Revenue sources, settlement fees, refunds, VAT treatment, tax rules and payment references must be verified before this becomes authoritative.</span></div>
    </div>}
    <footer className="nj-systems-preview-foot"><span><BadgeCheck size={14}/> Midnight Gold design direction</span><span>Fictional preview values · No production writes</span></footer>
  </section>;
}
