import { useEffect, useState } from 'react';
import { Coins, ShieldCheck } from 'lucide-react';
import { nightjarCommercial } from '../platform/firebase-commercial';

const money = (pence: number | null | undefined) => pence == null
  ? 'Not set'
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

type Props = { notify: (message: string) => void };

export default function CreatorCompensationCard({ notify }: Props) {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    void nightjarCommercial.creatorCompensation().then(setData).catch(() => notify('Creator compensation status could not be loaded.'));
  }, []);

  return <section className="research-panel creator-compensation-card">
    <div className="research-panel-head">
      <div><span className="mini-label">CREATOR PAY</span><h2>Standard rate, not a popularity contest.</h2><p>Nightjar’s standard creator rate scales with confirmed paid subscriptions and can be capped. Listening performance stays visible as analytics but does not determine the base rate.</p></div>
      <Coins size={22}/>
    </div>
    {!data ? <div className="people-empty">Loading compensation model…</div> : <>
      <div className="compensation-stats">
        <div><span>Current standard rate</span><strong>{money(data.standardMonthlyRatePence)}</strong></div>
        <div><span>Configured cap</span><strong>{money(data.monthlyCapPence)}</strong></div>
        <div><span>Paid subscribers counted</span><strong>{data.activePaidSubscribers ?? 0}</strong></div>
      </div>
      <div className="rights-ai-lock"><ShieldCheck size={16}/><div><strong>Popularity does not affect the standard rate.</strong><span>Verified listening is retained for creator analytics and discovery, not used to make one contracted creator’s base rate larger than another’s.</span></div></div>
      {data.eligibilityDefinition && <p className="panel-note"><strong>Eligibility:</strong> {data.eligibilityDefinition}</p>}
      {Array.isArray(data.rateBands) && data.rateBands.length > 0 ? <div className="rate-band-list">{data.rateBands.map((band: any) => <div key={String(band.minPaidSubscribers) + ':' + String(band.monthlyRatePence)}><span>{band.minPaidSubscribers.toLocaleString('en-GB')}+ paid subscribers</span><strong>{money(band.monthlyRatePence)} / month</strong></div>)}</div> : <p className="panel-note">Subscriber bands are intentionally not locked yet. Admin can add them after the next creator research round.</p>}
    </>}
  </section>;
}
