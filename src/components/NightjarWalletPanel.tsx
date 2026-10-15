import { useEffect, useState } from 'react';
import { Clock3, Gift, WalletCards } from 'lucide-react';
import { nightjarGifts, type NightjarEarnings, type NightjarGiftConfig, type NightjarGiftHistoryItem, type NightjarWallet } from '../platform/firebase-nightjars';
import ContextHelp from './ContextHelp';

type Props = {
  notify: (message: string) => void;
  professional?: boolean;
  demoMode?: boolean;
  compact?: boolean;
};

const money=(pence:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
const roleLabel=(role:string|null)=>role==='creator'?'VA Creator':role==='writer'?'Writer':role==='editor'?'Audio Editor':role==='artist'?'Artist':'Professional';

export default function NightjarWalletPanel({ notify, professional=false, demoMode=false, compact=false }: Props) {
  const [config,setConfig]=useState<NightjarGiftConfig|null>(null);
  const [wallet,setWallet]=useState<NightjarWallet|null>(null);
  const [earnings,setEarnings]=useState<NightjarEarnings|null>(null);
  const [history,setHistory]=useState<{sent:NightjarGiftHistoryItem[];received:NightjarGiftHistoryItem[]}>({sent:[],received:[]});
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    if(demoMode){
      const demoConfig:NightjarGiftConfig={
        unitCreatorValuePence:100,checkoutConfigured:false,
        packs:[{count:1,pricePence:169},{count:5,pricePence:749},{count:10,pricePence:1449},{count:15,pricePence:2149},{count:20,pricePence:2799}],
        eligibleRecipientRoles:['creator','writer','editor','artist'],
        rules:{oneRecipientPerGift:true,listenerToCreatorTransferOnly:true,transferableBetweenListeners:false,redeemableByPurchaser:false,expires:false},
      };
      setConfig(demoConfig);
      setWallet({balance:7,purchased:10,gifted:3,refunded:0,creatorValueLiabilityPence:700});
      if(professional)setEarnings({pendingNightjars:4,pendingPence:400,clearedNightjars:12,clearedPence:1200,lifetimeNightjars:16,lifetimePence:1600,byRole:{}});
      setHistory({sent:[],received:[]});
      setLoading(false);
      return;
    }
    void Promise.all([
      nightjarGifts.config(),
      nightjarGifts.wallet(),
      nightjarGifts.history(),
      nightjarGifts.earnings().catch(()=>null),
    ]).then(([nextConfig,nextWallet,nextHistory,nextEarnings])=>{
      if(cancelled)return;
      setConfig(nextConfig);setWallet(nextWallet);setHistory(nextHistory);setEarnings(nextEarnings);
    }).catch(()=>{if(!cancelled)notify('Nightjar wallet could not be loaded.');})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[professional,demoMode]);

  const showEarnings = professional || Number(earnings?.lifetimePence ?? 0) > 0;

  return <article className={compact ? "panel nightjar-wallet-panel compact" : "panel nightjar-wallet-panel"}>
    <div className="professional-role-head">
      <div><span className="mini-label">SUPPORT / NIGHTJARS</span><h2>Your Nightjar wallet</h2><p>Buy Nightjars in packs, keep them until you want them, then send them one-to-one to a VA Creator, Writer, Audio Editor or Artist.</p></div>
      <WalletCards size={20}/>
    </div>

    <div className="nightjar-wallet-metrics">
      <div><span>Available</span><strong><img className="nightjar-token-inline" src="/nightjar-token.svg" alt=""/>{loading?'…':wallet?.balance??0}</strong><small>Never expires</small></div>
      <div><span>Gifted</span><strong>{loading?'…':wallet?.gifted??0}</strong><small>Lifetime sent</small></div>
      {showEarnings&&<><div><span>Pending support</span><strong>{loading?'…':money(earnings?.pendingPence??0)}</strong><small>7-day clearance</small></div><div><span>Cleared support</span><strong>{loading?'…':money(earnings?.clearedPence??0)}</strong><small>Ready for payout cycle</small></div></>}
    </div>

    {compact?<details className="nightjar-pack-section compact-disclosure"><summary>Nightjar packs</summary><div className="compact-disclosure-body">
      <div><span className="mini-label">PACKS</span><h3>Nightjar packs <ContextHelp topic="wallet-checkout"/></h3><p>Each Nightjar always contributes £1.00 to the professional you eventually send it to.</p></div>
      <div className="nightjar-pack-grid">{config?.packs.map((pack)=><article key={pack.count}><span className="nightjar-pack-birds"><img className="nightjar-token-inline" src="/nightjar-token.svg" alt=""/> ×{pack.count}</span><strong>{money(pack.pricePence)}</strong><small>{money(Math.round(pack.pricePence/pack.count))} each</small><button className="secondary-button" disabled={!config.checkoutConfigured} onClick={()=>notify('Nightjar checkout will open here once the live payment provider is connected.')}>{config.checkoutConfigured?'Buy pack':'Checkout not connected yet'}</button></article>)}</div>
      {!config?.checkoutConfigured&&<p className="panel-note">Pack purchases are not available yet.</p>}
    </div></details>:<section className="nightjar-pack-section">
      <div><span className="mini-label">PACKS</span><h3>Nightjar packs <ContextHelp topic="wallet-checkout"/></h3><p>Each Nightjar always contributes £1.00 to the professional you eventually send it to.</p></div>
      <div className="nightjar-pack-grid">{config?.packs.map((pack)=><article key={pack.count}><span className="nightjar-pack-birds"><img className="nightjar-token-inline" src="/nightjar-token.svg" alt=""/> ×{pack.count}</span><strong>{money(pack.pricePence)}</strong><small>{money(Math.round(pack.pricePence/pack.count))} each</small><button className="secondary-button" disabled={!config.checkoutConfigured} onClick={()=>notify('Nightjar checkout will open here once the live payment provider is connected.')}>{config.checkoutConfigured?'Buy pack':'Checkout not connected yet'}</button></article>)}</div>
      {!config?.checkoutConfigured&&<p className="panel-note">Pack purchases are not available yet.</p>}
    </section>}

    {showEarnings&&earnings&&Object.keys(earnings.byRole??{}).length>0&&<section className="nightjar-role-earnings"><span className="mini-label">SUPPORT BY ROLE</span><div>{Object.entries(earnings.byRole).map(([role,value])=><article key={role}><strong>{roleLabel(role)}</strong><span>{money(Number(value.clearedPence??0))} cleared</span><small>{money(Number(value.pendingPence??0))} pending</small></article>)}</div></section>}

    {compact?<details className="nightjar-history compact-disclosure"><summary>Gift history</summary><div className="compact-disclosure-body">
      <div><span className="mini-label">RECENT SUPPORT</span><h3>Gift history</h3></div>
      <div className="nightjar-history-list">
        {history.sent.slice(0,6).map((item)=><article key={'sent-'+item.id}><Gift size={15}/><div><strong>Sent {item.quantity} Nightjar{item.quantity===1?'':'s'}</strong><small>{item.recipientDisplayName??roleLabel(item.recipientRole)} · {money(item.creatorCreditPence)}</small></div><em>{item.status==='cleared'?'Cleared':'Pending'}</em></article>)}
        {showEarnings&&history.received.slice(0,6).map((item)=><article key={'received-'+item.id}><img className="nightjar-token-inline" src="/nightjar-token.svg" alt=""/><div><strong>Received {item.quantity} Nightjar{item.quantity===1?'':'s'}</strong><small>{roleLabel(item.recipientRole)} · {money(item.creatorCreditPence)}</small></div><em>{item.status==='cleared'?<><Clock3 size={12}/> Cleared</>:'Pending'}</em></article>)}
        {!history.sent.length&&(!showEarnings||!history.received.length)&&<div className="people-empty"><Gift size={18}/><strong>No Nightjar gifts yet</strong><span>Your support activity will appear here.</span></div>}
      </div>
    </div></details>:<section className="nightjar-history">
      <div><span className="mini-label">RECENT SUPPORT</span><h3>Gift history</h3></div>
      <div className="nightjar-history-list">
        {history.sent.slice(0,6).map((item)=><article key={'sent-'+item.id}><Gift size={15}/><div><strong>Sent {item.quantity} Nightjar{item.quantity===1?'':'s'}</strong><small>{item.recipientDisplayName??roleLabel(item.recipientRole)} · {money(item.creatorCreditPence)}</small></div><em>{item.status==='cleared'?'Cleared':'Pending'}</em></article>)}
        {showEarnings&&history.received.slice(0,6).map((item)=><article key={'received-'+item.id}><img className="nightjar-token-inline" src="/nightjar-token.svg" alt=""/><div><strong>Received {item.quantity} Nightjar{item.quantity===1?'':'s'}</strong><small>{roleLabel(item.recipientRole)} · {money(item.creatorCreditPence)}</small></div><em>{item.status==='cleared'?<><Clock3 size={12}/> Cleared</>:'Pending'}</em></article>)}
        {!history.sent.length&&(!showEarnings||!history.received.length)&&<div className="people-empty"><Gift size={18}/><strong>No Nightjar gifts yet</strong><span>Your support activity will appear here.</span></div>}
      </div>
    </section>}
  </article>;
}
