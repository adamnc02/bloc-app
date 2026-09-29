import { useState, type ReactNode } from 'react';
import { KEYS } from '@/lib/storage';
import { Icon, type IconName } from '@/components/ui/Icon';
import { CoachLogo } from '@/components/brand/Brand';
import { navigate } from '@/app/router';

export type CoachTab = 'today' | 'clients' | 'diary' | 'library' | 'settings' | null;

const TABS: { key: Exclude<CoachTab, null>; label: string; icon: IconName; to: string }[] = [
  { key: 'today', label: 'Today', icon: 'today', to: '/today' },
  { key: 'clients', label: 'Clients', icon: 'clients', to: '/clients' },
  { key: 'diary', label: 'Diary', icon: 'diary', to: '/diary' },
  { key: 'library', label: 'Library', icon: 'library', to: '/library' },
];

/**
 * Coach navigation: Today · Clients · Diary · Library.
 * Bottom bar on a phone, side rail on a tablet or laptop.
 * Phone: Settings is reached from the account button, as in BLOC.
 * Tablet/laptop: Settings is its own item at the foot of the rail.
 */
function readCollapsed(): boolean {
  try { return localStorage.getItem(KEYS.railCollapsed) === '1'; } catch { return false; }
}

export function CoachShell({ tab, children }: { tab: CoachTab; children: ReactNode }) {
  // On a laptop (1200px and wider) the rail is expanded by default and collapses to the tablet's icon rail.
  // Below 1200px the toggle is hidden and the rail is the icon rail anyway.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { if (next) localStorage.setItem(KEYS.railCollapsed, '1'); else localStorage.removeItem(KEYS.railCollapsed); } catch { /* private mode: this session only */ }
  };
  return (
    <div className={`coach-shell${collapsed ? ' rail-collapsed' : ''}`}>
      <div className="rail-col"><nav className="rail" aria-label="BLOC Coach">
        <div className="rail-head">
          {/* The icon rail (tablet, or a collapsed laptop rail): Coach's own icon, the Home Screen art, served beside index.html. */}
          <div className="rail-logo-mark"><img className="rail-icon" src="bloc-coach-icon-square.svg" alt="BLOC Coach" width={48} height={48} /></div>
          <div className="rail-logo-full"><CoachLogo height={46} /></div>
          <button type="button" className="rail-toggle" onClick={toggle} aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand the side bar' : 'Collapse the side bar'} title={collapsed ? 'Expand' : 'Collapse'}>
            <Icon name="sidebar" size={22} />
          </button>
        </div>
        {TABS.map((t) => (
          <a key={t.key} href={`#${t.to}`} className="navi" aria-current={tab === t.key ? 'page' : undefined}>
            <Icon name={t.icon} size={22} /><span>{t.label}</span>
          </a>
        ))}
        <div className="rail-foot">
          <a href="#/settings" className="navi" aria-current={tab === 'settings' ? 'page' : undefined}><Icon name="settings" size={22} /><span>Settings</span></a>
        </div>
      </nav></div>
      <main className="coach-main">{children}</main>
      <nav className="bottom-nav" aria-label="BLOC Coach" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {TABS.map((t) => (
          <a key={t.key} href={`#${t.to}`} className="navi" aria-current={tab === t.key ? 'page' : undefined}>
            <Icon name={t.icon} size={22} /><span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

/** The Settings button for page headers on a phone (the rail carries Settings on wider screens): BLOC's gear. */
export function AccountButton() {
  return (
    <button type="button" className="icon-btn phone-only" aria-label="Settings" onClick={() => navigate('/settings')}>
      <Icon name="settings" size={22} />
    </button>
  );
}
