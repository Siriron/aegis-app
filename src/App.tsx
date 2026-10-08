import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { LandingPage } from './pages/LandingPage';
import { CommandPage } from './pages/CommandPage';
import { CharterNewPage } from './pages/CharterNewPage';
import { PolicyDetailPage } from './pages/CharterDetailPage';
import { IncidentNewPage } from './pages/IncidentNewPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { TokenDetailPage } from './pages/CapabilityDetailPage';
import { TargetPage } from './pages/VaultPage';

function NotFound() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <h1 className="font-ui font-bold text-3xl" style={{ color: 'var(--fg)' }}>Page not found</h1>
      <p className="mt-2" style={{ color: 'var(--fg-muted)' }}>That route does not exist.</p>
      <Link to="/command" className="btn btn-primary notched-sm inline-block mt-6">Back to Command</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)' }}>
        <Navbar />
        <main>
          <Routes>
            <Route path="/"              element={<LandingPage />} />
            <Route path="/command"       element={<CommandPage />} />
            <Route path="/policy/new"    element={<CharterNewPage />} />
            <Route path="/policy/:id"    element={<PolicyDetailPage />} />
            <Route path="/incident/new"  element={<IncidentNewPage />} />
            <Route path="/incident/:id"  element={<IncidentDetailPage />} />
            <Route path="/token/:id"     element={<TokenDetailPage />} />
            <Route path="/target"        element={<TargetPage />} />
            <Route path="/charter/new"   element={<Navigate to="/policy/new" replace />} />
            <Route path="/vault"         element={<Navigate to="/target" replace />} />
            <Route path="*"              element={<NotFound />} />
          </Routes>
        </main>
        <footer style={{ borderTop: '1px solid var(--border)', marginTop: '4rem' }}>
          <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
            <span className="font-ui text-xs font-bold tracking-widest"
              style={{ color: 'var(--fg-subtle)' }}>AEGIS · GenLayer StudioNet</span>
            <span className="font-mono text-xs" style={{ color: 'var(--fg-subtle)' }}>
              Emergency authority that cannot self-certify.
            </span>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}
