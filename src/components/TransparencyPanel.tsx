import { useEffect, useState } from 'react';
import { Scale, ShieldCheck, Users } from 'lucide-react';
import { nightjarCommercial } from '../platform/firebase-commercial';

const money = (pence: number | null | undefined) => pence == null
  ? 'Not set'
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

export default function TransparencyPanel() {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    void nightjarCommercial.transparency().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  return <section className="section-wrap transparency-panel">
    <div className="section-head"><div><p className="eyebrow"><Scale size={14}/> HOW NIGHTJAR WORKS</p><h2>Creative work should not disappear behind the platform.</h2></div></div>
    <div className="transparency-grid">
      <article className="research-panel"><span className="mini-label">SUBSCRIPTION</span><h3>{money(data.planningMonthlyPricePence)} planning price</h3><p>The planning price remains separate from confirmed billing data.</p></article>
      <article className="research-panel"><span className="mini-label">CREATOR PAY MODEL</span><h3>Capped equal standard rate</h3><p>{data.creatorMonthlyCapPence == null ? 'The final cap remains under research.' : 'Configured standard-rate cap: ' + money(data.creatorMonthlyCapPence) + ' per month.'}</p></article>
      <article className="research-panel"><span className="mini-label">CREATIVE NETWORK</span><h3>{(data.activeCreativeAccounts?.creators ?? 0) + (data.activeCreativeAccounts?.writers ?? 0) + (data.activeCreativeAccounts?.editors ?? 0)} active creative accounts</h3><p>{data.activeCreativeAccounts?.creators ?? 0} Creators · {data.activeCreativeAccounts?.writers ?? 0} Writers · {data.activeCreativeAccounts?.editors ?? 0} Audio Editors</p></article>
    </div>
    <div className="transparency-principles">{(data.principles ?? []).map((principle: string) => <div key={principle}><ShieldCheck size={15}/><span>{principle}</span></div>)}</div>
    <div className="support-capabilities"><Users size={16}/><span>Direct tips: {data.tipsEnabled ? 'enabled' : 'not live yet'} · Individual purchases: {data.individualPurchasesEnabled ? 'enabled' : 'not live yet'}</span></div>
  </section>;
}
