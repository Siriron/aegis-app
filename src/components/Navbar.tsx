import { Link, useLocation } from 'react-router-dom';
import { WalletButton } from './WalletButton';

const NAV = [
  { to: '/command',      label: 'Command' },
  { to: '/policy/new',  label: 'New Charter' },
  { to: '/incident/new', label: 'New Incident' },
  { to: '/target',       label: 'Vault' },
];

export function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      className="sticky top-0 z-50">
      <div className="accent-bar" />
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 26,8 26,20 14,26 2,20 2,8"
              stroke="var(--accent)" strokeWidth="1.5" fill="var(--accent-faint)" />
            <polygon points="14,7 21,11 21,17 14,21 7,17 7,11"
              fill="var(--accent)" opacity="0.3" />
            <polygon points="14,11 17,13 17,16 14,18 11,16 11,13"
              fill="var(--accent)" />
          </svg>
          <span className="font-ui font-bold tracking-widest text-sm uppercase"
            style={{ color: 'var(--fg)', letterSpacing: '0.15em' }}>
            AEGIS
          </span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1 flex-1">
          {NAV.map(n => {
            const active = pathname === n.to || pathname.startsWith(n.to.replace('/new', '/'));
            return (
              <Link key={n.to} to={n.to}
                className="font-ui text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded transition-colors"
                style={{
                  color: active ? 'var(--accent)' : 'var(--fg-muted)',
                  background: active ? 'var(--accent-faint)' : 'transparent',
                  letterSpacing: '0.08em',
                }}>
                {n.label}
              </Link>
            );
          })}
        </div>

        <WalletButton />
      </div>
    </nav>
  );
}
