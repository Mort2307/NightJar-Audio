import { ArrowRight, Bell, CheckCircle2, CircleAlert, Sparkles } from 'lucide-react';

export type RoleDashboardAction = {
  id: string;
  title: string;
  reason: string;
  label: string;
  onClick: () => void;
  priority?: 'high' | 'normal';
};

type Metric = { label: string; value: string | number; detail?: string };

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  metrics: Metric[];
  actions: RoleDashboardAction[];
  loading?: boolean;
};

export default function RoleDashboard({ eyebrow, title, description, metrics, actions, loading = false }: Props) {
  return <section className="nj-role-dashboard" aria-label={title}>
    <div className="nj-role-dashboard-head">
      <div><span className="mini-label">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
      <Sparkles size={19}/>
    </div>
    <div className="nj-role-dashboard-metrics">
      {metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{loading ? '…' : metric.value}</strong>{metric.detail && <small>{metric.detail}</small>}</div>)}
    </div>
    <div className="nj-next-actions">
      <div className="nj-next-actions-head"><div><span className="mini-label">NEXT ACTIONS</span><strong>Useful things to do next</strong></div><Bell size={15}/></div>
      {actions.length ? actions.slice(0,4).map((action) => <button className={action.priority === 'high' ? 'nj-next-action high' : 'nj-next-action'} key={action.id} onClick={action.onClick}>
        <span className="nj-next-action-icon">{action.priority === 'high' ? <CircleAlert size={15}/> : <CheckCircle2 size={15}/>}</span>
        <span><strong>{action.title}</strong><small>{action.reason}</small></span>
        <em>{action.label}</em><ArrowRight size={14}/>
      </button>) : <div className="nj-next-actions-clear"><CheckCircle2 size={17}/><span><strong>You’re caught up.</strong><small>Nightjar has no urgent account actions to suggest right now.</small></span></div>}
    </div>
  </section>;
}
