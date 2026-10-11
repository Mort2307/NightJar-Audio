import { ArrowRight, BarChart3, CheckCircle2, Headphones, LayoutDashboard, Rocket, ShieldCheck, Users, Wrench, LifeBuoy, type LucideIcon } from 'lucide-react';

export type AdminWorkspace = 'overview' | 'people' | 'content' | 'launch' | 'finance' | 'security' | 'assistance' | 'tools';

type Props = {
  active: AdminWorkspace;
  onChange: (workspace: AdminWorkspace) => void;
  pendingApplications: number;
  pendingImages: number;
  openAlerts: number;
};

const sections: { id: AdminWorkspace; label: string; detail: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', detail: 'What needs attention', icon: LayoutDashboard },
  { id: 'people', label: 'People', detail: 'Accounts and testers', icon: Users },
  { id: 'content', label: 'Content', detail: 'Approvals and moderation', icon: Headphones },
  { id: 'launch', label: 'Launch', detail: 'Didit and release readiness', icon: Rocket },
  { id: 'finance', label: 'Finance', detail: 'Revenue and payouts', icon: BarChart3 },
  { id: 'security', label: 'Safety', detail: 'Alerts and activity', icon: ShieldCheck },
  { id: 'assistance', label: 'Assistance', detail: 'Accounts and recovery', icon: LifeBuoy },
  { id: 'tools', label: 'Tools', detail: 'Mail, previews and branding', icon: Wrench },
];

export default function AdminWorkspaceTabs({ active, onChange, pendingApplications, pendingImages, openAlerts }: Props) {
  const count = (id: AdminWorkspace) => id === 'content' ? pendingApplications + pendingImages : id === 'security' ? openAlerts : 0;

  return (
    <nav className="nj-owner-workspaces" aria-label="Administrator workspaces">
      {sections.map((section) => {
        const Icon = section.icon;
        const pending = count(section.id);
        return (
          <button
            type="button"
            key={section.id}
            className={active === section.id ? 'nj-owner-workspace active' : 'nj-owner-workspace'}
            aria-current={active === section.id ? 'page' : undefined}
            onClick={() => onChange(section.id)}
          >
            <span className="nj-owner-workspace-icon"><Icon size={19} aria-hidden="true"/></span>
            <span className="nj-owner-workspace-copy"><strong>{section.label}</strong><small>{section.detail}</small></span>
            {pending > 0 ? <span className="nj-owner-workspace-count" aria-label={pending + ' items requiring review'}>{pending > 99 ? '99+' : pending}</span> : active === section.id ? <CheckCircle2 size={15} className="nj-owner-workspace-selected" aria-hidden="true"/> : <ArrowRight size={14} className="nj-owner-workspace-arrow" aria-hidden="true"/>}
          </button>
        );
      })}
    </nav>
  );
}
