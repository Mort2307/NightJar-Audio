import { Brush, Headphones, Home, Library, MessageCircle, Mic2, Bell, Search, Settings2, ShieldCheck, FileText, type LucideIcon } from 'lucide-react';

type View = 'discover' | 'library' | 'creators' | 'creator' | 'writer' | 'editor' | 'artist' | 'messages' | 'admin' | 'protection' | 'profile' | 'calendar' | 'settings';
type Role = 'admin' | 'creator' | 'listener' | 'writer' | 'editor' | 'artist' | null;

type Props = {
  view: View;
  role: Role;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  onActivity: () => void;
  activityUnreadCount?: number;
  messageUnreadCount?: number;
  messageNeedsReplyCount?: number;
};

type Item = { view?: View; label: string; accessibleLabel?: string; icon: LucideIcon; search?: boolean; activity?: boolean };

export default function MobileNavigation({ view, role, onNavigate, onSearch, onActivity, activityUnreadCount = 0, messageUnreadCount = 0, messageNeedsReplyCount = 0 }: Props) {
  if (!role) return null;

  const workspace: Item = role === 'creator'
    ? { view: 'creator', label: 'Studio', icon: Mic2 }
    : role === 'writer'
      ? { view: 'writer', label: 'Write', icon: FileText }
      : role === 'editor'
        ? { view: 'editor', label: 'Editor', accessibleLabel: 'Editor Studio', icon: FileText }
        : { view: 'artist', label: 'Artist', accessibleLabel: 'Artist Studio', icon: Brush };

  const settings: Item = { view: 'settings', label: 'You', accessibleLabel: 'Your credits, profile, settings and account', icon: Settings2 };
  const search: Item = { label: 'Search', icon: Search, search: true };

  // Exactly five unique destinations. Previously Admin appeared twice, and
  // the duplicate could make the mobile dock appear crowded or wrapped.
  const items: Item[] = role === 'listener'
    ? [
        { view: 'discover', label: 'Home', icon: Home },
        { view:'creators', label:'Explore', icon:Search, accessibleLabel:'Discover creators and their work' },
        { view: 'library', label: 'Library', icon: Library },
        { label:'Activity', icon:Bell, activity:true, accessibleLabel:'Activity and notifications' },
        settings,
      ]
    : role === 'admin'
      ? [
          { view: 'discover', label: 'Home', icon: Home },
          { view: 'messages', label: 'Inbox', accessibleLabel: 'NightJar Inbox and creator replies', icon: MessageCircle },
          { view: 'admin', label: 'Admin', icon: ShieldCheck },
          search,
          settings,
        ]
      : [
          workspace,
          { view: 'creators', label: 'Directory', icon: Headphones },
          { view: 'messages', label: 'Inbox', icon: MessageCircle },
          search,
          settings,
        ];

  return (
    <nav className="nj-mobile-nav" aria-label="Nightjar mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.view ? view === item.view : false;
        return (
          <button
            type="button"
            key={item.view ?? 'search'}
            className={active ? 'active' : ''}
            onClick={() => item.search ? onSearch() : item.activity ? onActivity() : item.view && onNavigate(item.view)}
            aria-current={active ? 'page' : undefined}
            aria-label={item.accessibleLabel ?? item.label}
          >
            <span className="nj-mobile-nav-icon">
              <Icon size={19} aria-hidden="true" />
              {item.activity && activityUnreadCount > 0 && <em>{activityUnreadCount > 9 ? '9+' : activityUnreadCount}</em>}
              {item.view === 'messages' && messageUnreadCount > 0 && <em>{messageUnreadCount > 9 ? '9+' : messageUnreadCount}</em>}
              {item.view === 'messages' && messageUnreadCount === 0 && messageNeedsReplyCount > 0 && <em className="needs-reply" title={messageNeedsReplyCount + ' conversation(s) need your reply'}>!</em>}
            </span>
            <span className="nj-mobile-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
