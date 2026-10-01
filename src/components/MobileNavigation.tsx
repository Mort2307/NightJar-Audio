import { Headphones, Home, Library, MessageCircle, Mic2, Search, Settings2, UserCircle2, FileText, type LucideIcon } from 'lucide-react';

type View = 'discover' | 'library' | 'creators' | 'creator' | 'writer' | 'editor' | 'messages' | 'admin' | 'protection' | 'profile';
type Role = 'admin' | 'creator' | 'listener' | 'writer' | 'editor' | null;

type Props = {
  view: View;
  role: Role;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  messageUnreadCount?: number;
  messageNeedsReplyCount?: number;
};

type Item = { view?: View; label: string; icon: LucideIcon; search?: boolean };

export default function MobileNavigation({ view, role, onNavigate, onSearch, messageUnreadCount = 0, messageNeedsReplyCount = 0 }: Props) {
  if (!role) return null;

  const roleHome: Item = role === 'creator'
    ? { view:'creator', label:'Studio', icon:Mic2 }
    : role === 'writer'
      ? { view:'writer', label:'Write', icon:FileText }
      : role === 'editor'
        ? { view:'editor', label:'Editorial', icon:FileText }
        : role === 'admin'
          ? { view:'admin', label:'Admin', icon:Settings2 }
          : { view:'discover', label:'Discover', icon:Home };

  const items: Item[] = role === 'listener'
    ? [
        roleHome,
        { view:'library', label:'Library', icon:Library },
        { label:'Search', icon:Search, search:true },
        { view:'creators', label:'Directory', icon:Headphones },
        { view:'profile', label:'Profile', icon:UserCircle2 },
      ]
    : role === 'admin'
      ? [
          roleHome,
          { view:'creators', label:'Directory', icon:Headphones },
          { label:'Search', icon:Search, search:true },
          { view:'profile', label:'Profile', icon:UserCircle2 },
          { view:'admin', label:'Admin', icon:Settings2 },
        ]
      : [
          roleHome,
          { view:'creators', label:'Directory', icon:Headphones },
          { label:'Search', icon:Search, search:true },
          { view:'messages', label:'Messages', icon:MessageCircle },
          { view:'profile', label:'Profile', icon:UserCircle2 },
        ];

  return <nav className="nj-mobile-nav" aria-label="Nightjar mobile navigation">
    {items.map((item) => {
      const Icon = item.icon;
      const active = item.view ? view === item.view : false;
      return <button key={item.label} className={active ? 'active' : ''} onClick={() => item.search ? onSearch() : item.view && onNavigate(item.view)} aria-current={active ? 'page' : undefined}>
        <span className="nj-mobile-nav-icon"><Icon size={18}/>{item.view === 'messages' && messageUnreadCount > 0 && <em>{messageUnreadCount > 9 ? '9+' : messageUnreadCount}</em>}{item.view === 'messages' && messageUnreadCount === 0 && messageNeedsReplyCount > 0 && <em className="needs-reply" title={messageNeedsReplyCount + ' conversation(s) need your reply'}>!</em>}</span>
        <span>{item.label}</span>
      </button>;
    })}
  </nav>;
}
