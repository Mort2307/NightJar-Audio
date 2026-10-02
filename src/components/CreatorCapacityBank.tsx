import { ShieldAlert, ShieldCheck, UsersRound, Vault } from 'lucide-react';
import type { CommercialOverview, CommercialSettings } from '../platform/firebase-commercial';

const money = (pence: number | null | undefined) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(pence ?? 0) / 100);

type Props = {
  overview: CommercialOverview | null;
  settings: CommercialSettings;
  busyUserId?: string | null;
  onTogglePaidSlot: (userId: string, active: boolean) => void;
};

export default function CreatorCapacityBank({ overview, settings, busyUserId = null, onTogglePaidSlot }: Props) {
  if (!overview) {
    return <section className="nightjar-admin-payout-panel"><div className="people-empty">Loading Creator Capacity Bank…</div></section>;
  }

  const sourceLabel = overview.eligibleNetRevenueSource === 'confirmed'
    ? 'Confirmed net values'
    : overview.eligibleNetRevenueSource === 'mixed'
      ? 'Mixed confirmed + planning estimate'
      : overview.eligibleNetRevenueSource === 'none'
        ? 'No paid revenue yet'
        : 'Conservative planning estimate';

  return <section className="nightjar-admin-payout-panel">
    <div className="subscription-finance-heading">
      <div>
        <span className="mini-label">CREATOR CAPACITY BANK</span>
        <h3>Keep paid Creator commitments comfortably below the line.</h3>
      </div>
      <span className={overview.capacityStatus === 'healthy' ? 'status-pill' : 'status-pill muted'}>
        {overview.capacityStatus === 'healthy' ? 'Healthy headroom' : overview.capacityStatus === 'guarded' ? 'Guarded' : 'Overcommitted'}
      </span>
    </div>

    <div className="subscription-payout-grid">
      <div><span>Eligible net revenue</span><strong>{money(overview.eligibleNetRevenuePence)}</strong><small>{sourceLabel}</small></div>
      <div><span>Creator capacity · {settings.creatorPoolPercent}%</span><strong>{money(overview.creatorCapacityPence)}</strong><small>Maximum compensation capacity before the safety guard.</small></div>
      <div><span>Paid Creator commitment</span><strong>{money(overview.plannedCreatorPayoutPence)}</strong><small>{overview.paidCreatorCount} paid slot{overview.paidCreatorCount === 1 ? '' : 's'} at the current band.</small></div>
      <div><span>Creator-budget utilisation</span><strong>{overview.creatorBudgetUtilizationPercent.toFixed(1)}%</strong><small>Safe target is no more than {settings.safeCreatorUtilizationPercent}%.</small></div>
      <div><span>Theoretical capacity</span><strong>{overview.theoreticalCreatorCapacity}</strong><small>Absolute mathematical slots at the current standard rate.</small></div>
      <div><span>Safe active capacity</span><strong>{overview.safeCreatorCapacity}</strong><small>Uses the lower of current and rolling-average eligible net revenue.</small></div>
      <div><span>Creator headroom in bank</span><strong>{overview.bankedCreatorCapacity}</strong><small>{settings.minimumBankedCreatorSlots} slot{settings.minimumBankedCreatorSlots === 1 ? '' : 's'} must remain banked before another release.</small></div>
      <div><span>Safe release slots now</span><strong>{overview.safeReleaseSlots}</strong><small>Still subject to the banked-headroom and stress-test gates.</small></div>
      <div><span>{settings.revenueAveragingDays}-day revenue average</span><strong>{money(overview.rollingAverageEligibleNetRevenuePence)}</strong><small>{overview.revenueHistorySampleDays} daily sample{overview.revenueHistorySampleDays === 1 ? '' : 's'} available so far.</small></div>
      <div><span>−{settings.subscriberStressTestPercent}% stress capacity</span><strong>{money(overview.stressCreatorCapacityPence)}</strong><small>{overview.stressTestPass ? 'Current paid roster survives the configured downturn.' : 'Current roster exceeds the configured downturn capacity.'}</small></div>
      <div><span>Unused Creator capacity</span><strong>{money(overview.unusedCreatorCapacityPence)}</strong><small>Rolls into Nightjar rather than being automatically committed.</small></div>
      <div><span>Growth & Stability contribution</span><strong>{money(overview.growthAndStabilityFundContributionPence)}</strong><small>{settings.businessFundPercent}% core business allocation plus unused Creator capacity.</small></div>
      <div><span>Company / profit allocation</span><strong>{money(overview.companyProfitAllocationPence)}</strong><small>{settings.companyProfitPercent}% of eligible net revenue before company tax/accounting treatment.</small></div>
    </div>

    <div className={overview.nextCreatorRecommended ? 'rights-ai-lock' : 'demo-warning admin-note'}>
      {overview.nextCreatorRecommended ? <ShieldCheck size={17}/> : <ShieldAlert size={17}/>}
      <div>
        <strong>{overview.nextCreatorRecommended ? 'ANOTHER PAID CREATOR SLOT IS FINANCIALLY SAFE' : 'KEEP THE NEXT CREATOR SLOT BANKED'}</strong>
        <span>{overview.nextCreatorRecommended
          ? 'Nightjar passes the utilisation, rolling-revenue, downturn and minimum-headroom gates. Release remains a manual administrator decision.'
          : 'Nightjar will not recommend another paid slot until the configured safety gates all pass. Slots are never opened automatically.'}</span>
      </div>
    </div>

    <div className="rights-ai-lock">
      <Vault size={17}/>
      <div>
        <strong>Automatic slot opening is disabled.</strong>
        <span>Creator accounts can exist on Nightjar without consuming a paid Creator slot. Only an administrator can release a slot, and the backend rejects unsafe activations.</span>
      </div>
    </div>

    <div className="admin-data-list">
      <div className="subscription-finance-heading">
        <div><span className="mini-label">PAID CREATOR ROSTER</span><h3>Manual slot release</h3></div>
        <span className="status-pill muted">{overview.paidCreatorCount} paid / {overview.activeCreatorCount} active Creator accounts</span>
      </div>
      {overview.creatorSlots.length === 0
        ? <div className="people-empty"><UsersRound size={18}/><strong>No active Creator accounts yet</strong><span>Approved Creator accounts will appear here without automatically becoming paid slots.</span></div>
        : overview.creatorSlots.map((creator) => <article className="admin-data-row" key={creator.userId}>
          <div>
            <strong>{creator.displayName}</strong>
            <span>{creator.paidCreatorSlotActive ? 'Paid Creator slot active' : 'Creator account · slot banked'}</span>
            {creator.email && <small>{creator.email}</small>}
          </div>
          <div className="admin-data-actions">
            <button
              type="button"
              className={creator.paidCreatorSlotActive ? 'ghost-button' : 'primary-button'}
              disabled={busyUserId === creator.userId}
              onClick={() => onTogglePaidSlot(creator.userId, !creator.paidCreatorSlotActive)}
            >
              {busyUserId === creator.userId ? 'Updating…' : creator.paidCreatorSlotActive ? 'Bank paid slot' : 'Release paid slot'}
            </button>
          </div>
        </article>)}
    </div>
  </section>;
}
