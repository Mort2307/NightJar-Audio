import { useEffect, useState } from 'react';
import { Coins, ShieldCheck } from 'lucide-react';
import { nightjarCommercial } from '../platform/firebase-commercial';
import { demoCompensation } from '../demo/nightjarDemo';

const money = (pence: number | null | undefined) => pence == null
  ? 'Not set'
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

type Props = { notify: (message: string) => void; demoMode?: boolean };

export default function CreatorCompensationCard({ notify, demoMode = false }: Props) {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    if (demoMode) {
      setData(demoCompensation);
      return;
    }
    void nightjarCommercial.creatorCompensation().then(setData).catch(() => notify('Creator compensation status could not be loaded.'));
  }, [demoMode]);

  return <section className="research-panel creator-compensation-card">
    <div className="research-panel-head">
      <div><span className="mini-label">ADMINISTRATION / CREATOR PAY</span><h2>Creator rate planning.</h2><p>Internal administrator view of Nightjar’s capped standard-rate model. These figures are operational planning data, not a public earnings promise.</p></div>
      <Coins size={22}/>
    </div>
    {!data ? <div className="people-empty">Loading compensation model…</div> : <>
      <div className="compensation-stats">
        <div><span>Current standard rate</span><strong>{money(data.standardMonthlyRatePence)}</strong></div>
        <div><span>Configured cap</span><strong>{money(data.monthlyCapPence)}</strong></div>
        <div><span>Paid subscribers counted</span><strong>{data.activePaidSubscribers ?? 0}</strong></div>
      </div>
      <div className="rights-ai-lock"><ShieldCheck size={16}/><div><strong>Administrator-only planning data.</strong><span>Popularity does not determine the standard base rate. Verified listening remains analytics and discovery data only.</span></div></div>
      {data.eligibilityDefinition && <p className="panel-note"><strong>Planning eligibility definition:</strong> {data.eligibilityDefinition}</p>}
      {Array.isArray(data.rateBands) && data.rateBands.length > 0 ? <div className="rate-band-list">{data.rateBands.map((band: any) => <div key={String(band.minPaidSubscribers) + ':' + String(band.monthlyRatePence)}><span>{band.minPaidSubscribers.toLocaleString('en-GB')}+ paid subscribers</span><strong>{money(band.monthlyRatePence)} / month</strong></div>)}</div> : <p className="panel-note">Subscriber bands are intentionally not locked yet. Admin can add them after the next creator research round.</p>}
    </>}
  </section>;
}
