import { useMemo, useState } from 'react';
import { Calculator, Coins, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Trash2, UsersRound, WalletCards } from 'lucide-react';
import type { CommercialSettings } from '../platform/firebase-commercial';

type Props = {
  settings: CommercialSettings;
  currentPaidSubscribers?: number;
  currentUsers?: number;
};
type RoleKey = 'creator' | 'writer' | 'editor' | 'artist';
type RoleScenario = { label: string; allocationPercent: number; eligiblePeople: number; monthlyCap: number };
type SavedFinanceScenario = {
  id: string;
  name: string;
  createdAt: string;
  inputs: {
    totalUsers: number;
    paidSubscribers: number;
    subscriptionPrice: number;
    vatRate: number;
    priceIncludesVat: boolean;
    processorPercent: number;
    processorFixed: number;
    refundPercent: number;
    contributorPercent: number;
    appPercent: number;
    operatorPercent: number;
    corporationTaxRate: number;
    appTaxablePercent: number;
    operatorTaxablePercent: number;
    rollUnusedToApp: boolean;
    roles: Record<RoleKey, RoleScenario>;
  };
  outputs: {
    customerBillings: number;
    distributableNet: number;
    contributorPaid: number;
    appPotAfterTax: number;
    operatorPotAfterTax: number;
    estimatedCorporationTax: number;
  };
};

const gbp = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })
    .format(Number.isFinite(value) ? value : 0);
const pct = (value: number) => (Number.isFinite(value) ? value : 0).toFixed(2) + '%';
const clamp = (value: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const NIGHTJAR_DEFAULT_MONTHLY_PRICE = 6.99;

const defaultRoles = (): Record<RoleKey, RoleScenario> => ({
  creator: { label: 'VA Creators', allocationPercent: 70, eligiblePeople: 5, monthlyCap: 3000 },
  writer: { label: 'Writers', allocationPercent: 12, eligiblePeople: 5, monthlyCap: 750 },
  editor: { label: 'Audio Editors', allocationPercent: 10, eligiblePeople: 4, monthlyCap: 750 },
  artist: { label: 'Artists', allocationPercent: 8, eligiblePeople: 3, monthlyCap: 500 },
});

export default function AdminFinanceSimulator({ settings, currentPaidSubscribers = 0, currentUsers = 0 }: Props) {
  const [totalUsers, setTotalUsers] = useState(25000);
  const [paidSubscribers, setPaidSubscribers] = useState(10000);
  const [subscriptionPrice, setSubscriptionPrice] = useState(NIGHTJAR_DEFAULT_MONTHLY_PRICE);
  const [vatRate, setVatRate] = useState(20);
  const [priceIncludesVat, setPriceIncludesVat] = useState(true);
  const [processorPercent, setProcessorPercent] = useState(2.9);
  const [processorFixed, setProcessorFixed] = useState(0.30);
  const [refundPercent, setRefundPercent] = useState(1);
  const [contributorPercent, setContributorPercent] = useState(50);
  const [appPercent, setAppPercent] = useState(20);
  const [operatorPercent, setOperatorPercent] = useState(30);
  const [corporationTaxRate, setCorporationTaxRate] = useState(25);
  const [appTaxablePercent, setAppTaxablePercent] = useState(50);
  const [operatorTaxablePercent, setOperatorTaxablePercent] = useState(100);
  const [rollUnusedToApp, setRollUnusedToApp] = useState(true);
  const [roles, setRoles] = useState<Record<RoleKey, RoleScenario>>(defaultRoles);
  const [hasSavedScenario, setHasSavedScenario] = useState(() => {
    try { return Boolean(window.localStorage.getItem('nightjar.admin.finance-scenario.v1')); }
    catch { return false; }
  });
  const [scenarioName,setScenarioName]=useState('');
  const [savedScenarios,setSavedScenarios]=useState<SavedFinanceScenario[]>(() => {
    try {
      const raw=window.localStorage.getItem('nightjar.admin.finance-scenarios.v2');
      const parsed=raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0,8) : [];
    } catch {
      return [];
    }
  });

  const saveSandboxScenario = () => {
    try {
      window.localStorage.setItem('nightjar.admin.finance-scenario.v1', JSON.stringify({
        totalUsers, paidSubscribers, subscriptionPrice, vatRate, priceIncludesVat, processorPercent, processorFixed,
        refundPercent, contributorPercent, appPercent, operatorPercent, corporationTaxRate, appTaxablePercent,
        operatorTaxablePercent, rollUnusedToApp, roles,
      }));
      setHasSavedScenario(true);
    } catch { /* local sandbox persistence is optional */ }
  };

  const loadSavedScenario = () => {
    try {
      const raw = window.localStorage.getItem('nightjar.admin.finance-scenario.v1');
      if (!raw) return;
      const saved = JSON.parse(raw);
      setTotalUsers(Math.max(0, Number(saved.totalUsers) || 0));
      setPaidSubscribers(Math.max(0, Number(saved.paidSubscribers) || 0));
      setSubscriptionPrice(Math.max(0, Number(saved.subscriptionPrice) || 0));
      setVatRate(clamp(Number(saved.vatRate), 0, 100));
      setPriceIncludesVat(saved.priceIncludesVat !== false);
      setProcessorPercent(clamp(Number(saved.processorPercent), 0, 100));
      setProcessorFixed(Math.max(0, Number(saved.processorFixed) || 0));
      setRefundPercent(clamp(Number(saved.refundPercent), 0, 100));
      setContributorPercent(clamp(Number(saved.contributorPercent), 0, 100));
      setAppPercent(clamp(Number(saved.appPercent), 0, 100));
      setOperatorPercent(clamp(Number(saved.operatorPercent), 0, 100));
      setCorporationTaxRate(clamp(Number(saved.corporationTaxRate), 0, 100));
      setAppTaxablePercent(clamp(Number(saved.appTaxablePercent), 0, 100));
      setOperatorTaxablePercent(clamp(Number(saved.operatorTaxablePercent), 0, 100));
      setRollUnusedToApp(saved.rollUnusedToApp !== false);
      if (saved.roles && typeof saved.roles === 'object') {
        const defaults = defaultRoles();
        const next = { ...defaults } as Record<RoleKey, RoleScenario>;
        (Object.keys(defaults) as RoleKey[]).forEach((key) => {
          const role = saved.roles[key] ?? {};
          next[key] = {
            label: defaults[key].label,
            allocationPercent: clamp(Number(role.allocationPercent ?? defaults[key].allocationPercent), 0, 100),
            eligiblePeople: Math.max(0, Math.round(Number(role.eligiblePeople ?? defaults[key].eligiblePeople) || 0)),
            monthlyCap: Math.max(0, Number(role.monthlyCap ?? defaults[key].monthlyCap) || 0),
          };
        });
        setRoles(next);
      }
    } catch { /* ignore invalid local sandbox state */ }
  };

  const resetNightjarScenario = () => {
    setTotalUsers(25000);
    setPaidSubscribers(10000);
    setSubscriptionPrice(NIGHTJAR_DEFAULT_MONTHLY_PRICE);
    setVatRate(20);
    setPriceIncludesVat(true);
    setProcessorPercent(2.9);
    setProcessorFixed(0.30);
    setRefundPercent(1);
    setContributorPercent(50);
    setAppPercent(20);
    setOperatorPercent(30);
    setCorporationTaxRate(25);
    setAppTaxablePercent(50);
    setOperatorTaxablePercent(100);
    setRollUnusedToApp(true);
    setRoles(defaultRoles());
  };

  const loadCommercialAssumptions = () => {
    if (settings.planningMonthlyPricePence != null) setSubscriptionPrice(settings.planningMonthlyPricePence / 100);
    if (currentPaidSubscribers > 0) setPaidSubscribers(currentPaidSubscribers);
    if (currentUsers > 0) setTotalUsers(Math.max(currentUsers, currentPaidSubscribers));
    setContributorPercent(settings.creatorPoolPercent);
    setAppPercent(settings.businessFundPercent);
    setOperatorPercent(settings.companyProfitPercent);
  };

  const model = useMemo(() => {
    const subscribers = Math.max(0, Math.round(paidSubscribers));
    const users = Math.max(subscribers, Math.round(totalUsers));
    const baseSubscriptionRevenue = subscribers * clamp(subscriptionPrice);
    const vat = clamp(vatRate, 0, 100);
    const customerBillings = priceIncludesVat ? baseSubscriptionRevenue : baseSubscriptionRevenue * (1 + vat / 100);
    const refunds = Math.max(0, customerBillings * clamp(refundPercent, 0, 100) / 100);
    const retainedCustomerSales = Math.max(0, customerBillings - refunds);
    const vatCollected = vat <= 0 ? 0 : priceIncludesVat
      ? retainedCustomerSales * (vat / (100 + vat))
      : (retainedCustomerSales / (1 + vat / 100)) * (vat / 100);
    const processorFees = Math.max(0, customerBillings * clamp(processorPercent, 0, 100) / 100 + subscribers * clamp(processorFixed));
    const distributableNet = Math.max(0, retainedCustomerSales - vatCollected - processorFees);

    const primaryPercentTotal = contributorPercent + appPercent + operatorPercent;
    const contributorPot = distributableNet * contributorPercent / 100;
    const appPotBase = distributableNet * appPercent / 100;
    const operatorPotBase = distributableNet * operatorPercent / 100;

    const rolePercentTotal = Object.values(roles).reduce((sum, role) => sum + role.allocationPercent, 0);
    const roleResults = (Object.keys(roles) as RoleKey[]).map((key) => {
      const role = roles[key];
      const allocated = contributorPot * role.allocationPercent / 100;
      const people = Math.max(0, Math.round(role.eligiblePeople));
      const uncappedPerPerson = people > 0 ? allocated / people : 0;
      const perPerson = people > 0 ? Math.min(uncappedPerPerson, clamp(role.monthlyCap)) : 0;
      const paid = people * perPerson;
      const unused = Math.max(0, allocated - paid);
      return { key, ...role, allocated, people, uncappedPerPerson, perPerson, paid, unused };
    });

    const contributorPaid = roleResults.reduce((sum, role) => sum + role.paid, 0);
    const unusedContributor = Math.max(0, contributorPot - contributorPaid);
    const appPotBeforeTax = appPotBase + (rollUnusedToApp ? unusedContributor : 0);
    const bankedContributorCapacity = rollUnusedToApp ? 0 : unusedContributor;

    const appTaxableContribution = appPotBeforeTax * clamp(appTaxablePercent, 0, 100) / 100;
    const operatorTaxableContribution = operatorPotBase * clamp(operatorTaxablePercent, 0, 100) / 100;
    const estimatedTaxableProfit = appTaxableContribution + operatorTaxableContribution;
    const estimatedCorporationTax = estimatedTaxableProfit * clamp(corporationTaxRate, 0, 100) / 100;
    const taxableContributionTotal = appTaxableContribution + operatorTaxableContribution;
    const appTaxShare = taxableContributionTotal > 0 ? estimatedCorporationTax * appTaxableContribution / taxableContributionTotal : 0;
    const operatorTaxShare = taxableContributionTotal > 0 ? estimatedCorporationTax * operatorTaxableContribution / taxableContributionTotal : 0;
    const appPotAfterTax = Math.max(0, appPotBeforeTax - appTaxShare);
    const operatorPotAfterTax = Math.max(0, operatorPotBase - operatorTaxShare);

    return {
      subscribers,
      users,
      subscriberConversion: users > 0 ? subscribers / users * 100 : 0,
      customerBillings,
      vatCollected,
      processorFees,
      refunds,
      distributableNet,
      primaryPercentTotal,
      contributorPot,
      appPotBase,
      operatorPotBase,
      rolePercentTotal,
      roleResults,
      contributorPaid,
      unusedContributor,
      appPotBeforeTax,
      bankedContributorCapacity,
      estimatedTaxableProfit,
      estimatedCorporationTax,
      appTaxShare,
      operatorTaxShare,
      appPotAfterTax,
      operatorPotAfterTax,
      effectiveContributorPercent: distributableNet > 0 ? contributorPaid / distributableNet * 100 : 0,
    };
  }, [
    totalUsers, paidSubscribers, subscriptionPrice, vatRate, priceIncludesVat, processorPercent, processorFixed,
    refundPercent, contributorPercent, appPercent, operatorPercent, corporationTaxRate, appTaxablePercent,
    operatorTaxablePercent, rollUnusedToApp, roles,
  ]);

  const financeInputs = () => ({
    totalUsers,
    paidSubscribers,
    subscriptionPrice,
    vatRate,
    priceIncludesVat,
    processorPercent,
    processorFixed,
    refundPercent,
    contributorPercent,
    appPercent,
    operatorPercent,
    corporationTaxRate,
    appTaxablePercent,
    operatorTaxablePercent,
    rollUnusedToApp,
    roles:structuredClone(roles),
  });

  const persistSavedScenarios = (next: SavedFinanceScenario[]) => {
    setSavedScenarios(next);
    try { window.localStorage.setItem('nightjar.admin.finance-scenarios.v2', JSON.stringify(next)); }
    catch { /* local comparison storage is optional */ }
  };

  const saveNamedScenario = () => {
    const name=scenarioName.trim() || 'Scenario ' + (savedScenarios.length + 1);
    const scenario: SavedFinanceScenario = {
      id:(typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now()),
      name:name.slice(0,60),
      createdAt:new Date().toISOString(),
      inputs:financeInputs(),
      outputs:{
        customerBillings:model.customerBillings,
        distributableNet:model.distributableNet,
        contributorPaid:model.contributorPaid,
        appPotAfterTax:model.appPotAfterTax,
        operatorPotAfterTax:model.operatorPotAfterTax,
        estimatedCorporationTax:model.estimatedCorporationTax,
      },
    };
    persistSavedScenarios([scenario,...savedScenarios].slice(0,8));
    setScenarioName('');
  };

  const loadNamedScenario = (scenario: SavedFinanceScenario) => {
    const saved=scenario.inputs;
    setTotalUsers(saved.totalUsers);
    setPaidSubscribers(saved.paidSubscribers);
    setSubscriptionPrice(saved.subscriptionPrice);
    setVatRate(saved.vatRate);
    setPriceIncludesVat(saved.priceIncludesVat);
    setProcessorPercent(saved.processorPercent);
    setProcessorFixed(saved.processorFixed);
    setRefundPercent(saved.refundPercent);
    setContributorPercent(saved.contributorPercent);
    setAppPercent(saved.appPercent);
    setOperatorPercent(saved.operatorPercent);
    setCorporationTaxRate(saved.corporationTaxRate);
    setAppTaxablePercent(saved.appTaxablePercent);
    setOperatorTaxablePercent(saved.operatorTaxablePercent);
    setRollUnusedToApp(saved.rollUnusedToApp);
    setRoles(structuredClone(saved.roles));
  };

  const removeNamedScenario = (id:string) => persistSavedScenarios(savedScenarios.filter((scenario)=>scenario.id!==id));

  const updateRole = (key: RoleKey, field: Exclude<keyof RoleScenario, 'label'>, value: number) =>
    setRoles((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));

  const splitsValid = Math.abs(model.primaryPercentTotal - 100) < 0.001;
  const rolesValid = Math.abs(model.rolePercentTotal - 100) < 0.001;

  return <section className="admin-finance-simulator">
    <div className="admin-finance-simulator-hero">
      <div>
        <span className="mini-label">ADMIN / FINANCE LAB</span>
        <h3>Model the fairest Nightjar baseline before committing to it.</h3>
        <p>Change subscribers, price, VAT, payment costs, the three main revenue pots and the share paid to each professional role. Every output recalculates immediately; nothing here changes live billing or payout policy.</p>
      </div>
      <div className="admin-finance-simulator-actions">
        <button className="secondary-button" onClick={loadCommercialAssumptions}><WalletCards size={14}/> Load current Nightjar assumptions</button>
        <button className="secondary-button" onClick={saveSandboxScenario}>Save sandbox scenario</button>
        {hasSavedScenario && <button className="ghost-button" onClick={loadSavedScenario}>Load saved scenario</button>}
        <button className="ghost-button" onClick={resetNightjarScenario}><RefreshCw size={14}/> Reset 10k / £6.99 scenario</button>
      </div>
    </div>

    <div className="finance-sim-status-row">
      <span className={splitsValid ? 'status-pill' : 'status-pill muted'}>{splitsValid ? 'Main pots = 100%' : 'Main pots = ' + model.primaryPercentTotal.toFixed(2) + '%'}</span>
      <span className={rolesValid ? 'status-pill' : 'status-pill muted'}>{rolesValid ? 'Contributor roles = 100%' : 'Contributor roles = ' + model.rolePercentTotal.toFixed(2) + '%'}</span>
      <span className="status-pill muted">{model.subscriberConversion.toFixed(1)}% user → paid conversion</span>
    </div>

    <section className="finance-scenario-comparison">
      <div className="subscription-finance-heading">
        <div><span className="mini-label">SCENARIO COMPARISON</span><h3>Keep the baselines you want to compare.</h3><p className="panel-note">Save up to eight named simulations. Each snapshot preserves the assumptions and the resulting monthly money split so changing the live sandbox does not destroy the previous comparison.</p></div>
        <div className="finance-scenario-save"><input value={scenarioName} maxLength={60} onChange={(event)=>setScenarioName(event.target.value)} placeholder="e.g. Fair baseline"/><button className="secondary-button" onClick={saveNamedScenario}><Save size={14}/> Save current</button></div>
      </div>
      <div className="finance-scenario-table">
        <div className="finance-scenario-row current"><div><strong>Current sandbox</strong><small>{model.subscribers.toLocaleString()} paid · {gbp(subscriptionPrice)}/month</small></div><span>{gbp(model.distributableNet)}<small>net</small></span><span>{gbp(model.contributorPaid)}<small>professionals</small></span><span>{gbp(model.appPotAfterTax)}<small>app after tax</small></span><span>{gbp(model.operatorPotAfterTax)}<small>owners after tax</small></span><span>{gbp(model.estimatedCorporationTax)}<small>tax reserve</small></span><div/></div>
        {savedScenarios.map((scenario)=><div className="finance-scenario-row" key={scenario.id}>
          <div><strong>{scenario.name}</strong><small>{scenario.inputs.paidSubscribers.toLocaleString()} paid · {gbp(scenario.inputs.subscriptionPrice)}/month</small></div>
          <span>{gbp(scenario.outputs.distributableNet)}<small>net</small></span>
          <span>{gbp(scenario.outputs.contributorPaid)}<small>professionals</small></span>
          <span>{gbp(scenario.outputs.appPotAfterTax)}<small>app after tax</small></span>
          <span>{gbp(scenario.outputs.operatorPotAfterTax)}<small>owners after tax</small></span>
          <span>{gbp(scenario.outputs.estimatedCorporationTax)}<small>tax reserve</small></span>
          <div><button className="ghost-button" onClick={()=>loadNamedScenario(scenario)}>Load</button><button className="ghost-button" aria-label={'Delete '+scenario.name} onClick={()=>removeNamedScenario(scenario.id)}><Trash2 size={13}/></button></div>
        </div>)}
        {!savedScenarios.length && <div className="people-empty"><Calculator size={17}/><strong>No comparison scenarios saved yet.</strong><span>Set the numbers how you want, name the model and save it. You can then change everything and compare without losing this baseline.</span></div>}
      </div>
    </section>

    <div className="finance-sim-control-grid">
      <article className="panel finance-sim-controls">
        <div className="finance-sim-card-head"><div><span className="mini-label">AUDIENCE & PRICE</span><h4>Revenue assumptions</h4></div><UsersRound size={18}/></div>
        <label>Total registered users<input type="number" min="0" step="100" value={totalUsers} onChange={(event)=>setTotalUsers(Math.max(0,Number(event.target.value)||0))}/></label>
        <label>Paid subscribers<input type="number" min="0" step="100" value={paidSubscribers} onChange={(event)=>setPaidSubscribers(Math.max(0,Number(event.target.value)||0))}/></label>
        <label>Subscription price (£ / month)<input type="number" min="0" step="0.01" value={subscriptionPrice} onChange={(event)=>setSubscriptionPrice(Math.max(0,Number(event.target.value)||0))}/></label>
        <label className="rights-check"><input type="checkbox" checked={priceIncludesVat} onChange={(event)=>setPriceIncludesVat(event.target.checked)}/> Subscription price includes VAT / sales tax</label>
        <label>VAT / sales-tax rate (%)<input type="number" min="0" max="100" step="0.1" value={vatRate} onChange={(event)=>setVatRate(clamp(Number(event.target.value),0,100))}/></label>
      </article>

      <article className="panel finance-sim-controls">
        <div className="finance-sim-card-head"><div><span className="mini-label">COST OF COLLECTION</span><h4>Payment & refund assumptions</h4></div><Coins size={18}/></div>
        <label>Processor fee (%)<input type="number" min="0" max="100" step="0.01" value={processorPercent} onChange={(event)=>setProcessorPercent(clamp(Number(event.target.value),0,100))}/></label>
        <label>Processor fixed fee / subscriber (£)<input type="number" min="0" step="0.01" value={processorFixed} onChange={(event)=>setProcessorFixed(Math.max(0,Number(event.target.value)||0))}/></label>
        <label>Refund / chargeback allowance (%)<input type="number" min="0" max="100" step="0.01" value={refundPercent} onChange={(event)=>setRefundPercent(clamp(Number(event.target.value),0,100))}/></label>
        <div className="finance-sim-mini-result"><span>Customer billings</span><strong>{gbp(model.customerBillings)}</strong><small>{gbp(model.customerBillings * 12)} annualised</small></div>
        <div className="finance-sim-mini-result"><span>Distributable net</span><strong>{gbp(model.distributableNet)}</strong><small>after VAT, processor assumptions and refunds</small></div>
      </article>

      <article className="panel finance-sim-controls finance-sim-controls-wide">
        <div className="finance-sim-card-head"><div><span className="mini-label">MAIN POTS</span><h4>Who receives the post-fee net revenue?</h4></div><SlidersHorizontal size={18}/></div>
        <div className="finance-sim-three">
          <label>All professional contributors (%)<input type="number" min="0" max="100" step="0.1" value={contributorPercent} onChange={(event)=>setContributorPercent(clamp(Number(event.target.value),0,100))}/></label>
          <label>Nightjar app / business fund (%)<input type="number" min="0" max="100" step="0.1" value={appPercent} onChange={(event)=>setAppPercent(clamp(Number(event.target.value),0,100))}/></label>
          <label>Operator / owners pot (%)<input type="number" min="0" max="100" step="0.1" value={operatorPercent} onChange={(event)=>setOperatorPercent(clamp(Number(event.target.value),0,100))}/></label>
        </div>
        {!splitsValid && <div className="finance-sim-warning"><strong>Main pots must total 100%.</strong><span>The simulator still shows the arithmetic so you can experiment, but this split would not reconcile as a final policy.</span></div>}
      </article>
    </div>

    <div className="finance-sim-waterfall">
      <article><span>Gross customer billings</span><strong>{gbp(model.customerBillings)}</strong><small>{gbp(model.customerBillings / Math.max(1,model.subscribers))} billed per paid subscriber</small></article>
      <article><span>VAT / sales tax collected</span><strong>−{gbp(model.vatCollected)}</strong><small>statutory sales-tax component under this scenario</small></article>
      <article><span>Processor costs</span><strong>−{gbp(model.processorFees)}</strong><small>{pct(model.customerBillings ? model.processorFees / model.customerBillings * 100 : 0)} of billings</small></article>
      <article><span>Refund allowance</span><strong>−{gbp(model.refunds)}</strong><small>{refundPercent.toFixed(2)}% planning allowance</small></article>
      <article className="primary"><span>Post-fee distributable net</span><strong>{gbp(model.distributableNet)}</strong><small>{gbp(model.distributableNet * 12)} annualised</small></article>
    </div>

    <div className="finance-sim-pot-grid">
      <article className="finance-sim-pot contributor"><span>PROFESSIONAL CONTRIBUTORS</span><strong>{gbp(model.contributorPot)}</strong><small>{contributorPercent.toFixed(1)}% target pool · {gbp(model.contributorPaid)} actually allocated after caps</small></article>
      <article className="finance-sim-pot app"><span>NIGHTJAR APP / BUSINESS</span><strong>{gbp(model.appPotBeforeTax)}</strong><small>{gbp(model.appPotBase)} base{rollUnusedToApp ? ' + ' + gbp(model.unusedContributor) + ' unused contributor capacity' : ''}</small></article>
      <article className="finance-sim-pot operator"><span>OPERATOR / OWNERS</span><strong>{gbp(model.operatorPotBase)}</strong><small>{operatorPercent.toFixed(1)}% before estimated corporation tax</small></article>
    </div>

    <section className="finance-sim-contributor-lab">
      <div className="subscription-finance-heading">
        <div><span className="mini-label">CONTRIBUTOR POT</span><h3>Value every professional role without pretending every role has the same economics.</h3></div>
        <span className={rolesValid ? 'status-pill' : 'status-pill muted'}>{model.rolePercentTotal.toFixed(1)}% allocated</span>
      </div>
      <p className="panel-note">These are scenario weights, counts and caps — not promises. The default sandbox deliberately gives VA Creators the largest share while reserving visible paid recognition for Writers, Audio Editors and Artists.</p>
      <div className="finance-role-table">
        <div className="finance-role-table-head"><span>Role</span><span>Pool share</span><span>Eligible people</span><span>Monthly cap / person</span><span>Role pool</span><span>Per person</span><span>Actually paid</span></div>
        {(Object.keys(roles) as RoleKey[]).map((key)=>{
          const role=roles[key];
          const result=model.roleResults.find((item)=>item.key===key)!;
          return <div className="finance-role-row" key={key}>
            <strong>{role.label}</strong>
            <label><input aria-label={role.label+' pool percent'} type="number" min="0" max="100" step="0.1" value={role.allocationPercent} onChange={(event)=>updateRole(key,'allocationPercent',clamp(Number(event.target.value),0,100))}/><small>%</small></label>
            <label><input aria-label={role.label+' eligible people'} type="number" min="0" step="1" value={role.eligiblePeople} onChange={(event)=>updateRole(key,'eligiblePeople',Math.max(0,Math.round(Number(event.target.value)||0)))}/></label>
            <label><span>£</span><input aria-label={role.label+' cap'} type="number" min="0" step="25" value={role.monthlyCap} onChange={(event)=>updateRole(key,'monthlyCap',Math.max(0,Number(event.target.value)||0))}/></label>
            <span>{gbp(result.allocated)}</span>
            <span><strong>{gbp(result.perPerson)}</strong><small>{result.people ? String(result.people)+' people' : 'no eligible people'}</small></span>
            <span><strong>{gbp(result.paid)}</strong><small>{result.unused > 0 ? gbp(result.unused)+' uncommitted' : 'fully allocated'}</small></span>
          </div>;
        })}
      </div>
      {!rolesValid && <div className="finance-sim-warning"><strong>Contributor role shares must total 100%.</strong><span>Adjust the four role shares until the contributor pool reconciles.</span></div>}
      <label className="rights-check finance-rollover-check"><input type="checkbox" checked={rollUnusedToApp} onChange={(event)=>setRollUnusedToApp(event.target.checked)}/> Roll unused / cap-limited contributor capacity into the Nightjar app & business fund</label>
    </section>

    <section className="finance-sim-tax-lab">
      <div className="subscription-finance-heading">
        <div><span className="mini-label">TAX PLANNING</span><h3>Estimate the tax reserve instead of hiding it inside “profit”.</h3></div>
        <Calculator size={18}/>
      </div>
      <div className="finance-sim-three">
        <label>Corporation-tax planning rate (%)<input type="number" min="0" max="100" step="0.1" value={corporationTaxRate} onChange={(event)=>setCorporationTaxRate(clamp(Number(event.target.value),0,100))}/></label>
        <label>App/business pot treated as taxable profit (%)<input type="number" min="0" max="100" step="0.1" value={appTaxablePercent} onChange={(event)=>setAppTaxablePercent(clamp(Number(event.target.value),0,100))}/></label>
        <label>Operator pot treated as taxable profit (%)<input type="number" min="0" max="100" step="0.1" value={operatorTaxablePercent} onChange={(event)=>setOperatorTaxablePercent(clamp(Number(event.target.value),0,100))}/></label>
      </div>
      <div className="finance-sim-tax-grid">
        <div><span>Estimated taxable profit</span><strong>{gbp(model.estimatedTaxableProfit)}</strong><small>based only on the percentages above</small></div>
        <div><span>Estimated corporation tax</span><strong>{gbp(model.estimatedCorporationTax)}</strong><small>{corporationTaxRate.toFixed(1)}% planning rate</small></div>
        <div><span>App fund after estimated tax share</span><strong>{gbp(model.appPotAfterTax)}</strong><small>estimated tax share {gbp(model.appTaxShare)}</small></div>
        <div><span>Operator pot after estimated tax share</span><strong>{gbp(model.operatorPotAfterTax)}</strong><small>estimated tax share {gbp(model.operatorTaxShare)}</small></div>
      </div>
      <div className="demo-warning admin-note"><ShieldCheck size={17}/><div><strong>PLANNING MODEL, NOT A TAX RETURN</strong><span>The arithmetic is exact for the assumptions you enter, but actual UK VAT, corporation tax, deductible expenses, payroll/NIC and payment-provider treatment depend on Nightjar’s legal structure and real accounts. Use this box to reserve conservatively; use accountant-confirmed figures for filings.</span></div></div>
    </section>

    <section className="finance-sim-summary">
      <div className="subscription-finance-heading">
        <div><span className="mini-label">SCENARIO RESULT</span><h3>What this model does with one month of Nightjar.</h3></div>
        <span className={splitsValid && rolesValid ? 'status-pill' : 'status-pill muted'}>{splitsValid && rolesValid ? 'Scenario reconciles' : 'Adjust percentages'}</span>
      </div>
      <div className="finance-sim-summary-grid">
        <div><span>Paid to professionals</span><strong>{gbp(model.contributorPaid)}</strong><small>{pct(model.effectiveContributorPercent)} of distributable net actually paid after caps</small></div>
        <div><span>Unused contributor capacity</span><strong>{gbp(model.unusedContributor)}</strong><small>{rollUnusedToApp ? 'rolled to app/business fund' : 'kept banked in contributor reserve'}</small></div>
        <div><span>App/business after estimated tax</span><strong>{gbp(model.appPotAfterTax)}</strong><small>{gbp(model.appPotAfterTax * 12)} annualised</small></div>
        <div><span>Operator/owners after estimated tax</span><strong>{gbp(model.operatorPotAfterTax)}</strong><small>{gbp(model.operatorPotAfterTax * 12)} annualised</small></div>
        <div><span>Estimated corporation tax</span><strong>{gbp(model.estimatedCorporationTax)}</strong><small>{gbp(model.estimatedCorporationTax * 12)} annualised planning reserve</small></div>
        <div><span>VAT / sales tax</span><strong>{gbp(model.vatCollected)}</strong><small>{gbp(model.vatCollected * 12)} annualised statutory sales-tax component</small></div>
      </div>
    </section>
  </section>;
}
