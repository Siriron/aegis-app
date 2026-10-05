import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Vault, Engine, Gate } from '../aegis/client';
import { IS_DEPLOYED, explorerAddr, VAULT_ADDRESS, ENGINE_ADDRESS, GATE_ADDRESS, TARGET_ADDRESS } from '../aegis/config';
import { IncidentStatusBadge, TokenStateBadge } from '../components/StatusBadge';
import { shortAddr, formatTs } from '../utils/format';
import type { Policy, Incident, AuthorityToken } from '../aegis/types';

export function CommandPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tokens, setTokens] = useState<AuthorityToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_DEPLOYED) return;
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true);
    void (async () => {
      try {
        const [pids, iids, tids] = await Promise.all([
          Vault.listPolicyIds(),
          Engine.listIncidentIds(),
          Gate.listTokenIds(),
        ]);
        const [ps, is_, ts] = await Promise.all([
          Promise.all(pids.map(k => Vault.getPolicy(k))),
          Promise.all(iids.map(k => Engine.getIncident(k))),
          Promise.all(tids.map(k => Gate.getToken(k))),
        ]);
        setPolicies(ps.filter((p): p is Policy => p !== null));
        setIncidents(is_.filter((i): i is Incident => i !== null));
        setTokens(ts.filter((t): t is AuthorityToken => t !== null));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
            style={{ color: 'var(--fg-subtle)' }}>AEGIS</p>
          <h1 className="font-ui font-bold text-3xl" style={{ color: 'var(--fg)' }}>
            Command Center
          </h1>
        </div>
        <div className="flex gap-2">
          <Link to="/policy/new" className="btn btn-outline-accent notched-sm">+ Policy</Link>
          <Link to="/incident/new" className="btn btn-primary notched-sm">+ Incident</Link>
        </div>
      </div>

      {/* Contract grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {([
          { label: 'Policy Vault', addr: VAULT_ADDRESS },
          { label: 'Engine',      addr: ENGINE_ADDRESS },
          { label: 'Auth Gate',   addr: GATE_ADDRESS },
          { label: 'Target',      addr: TARGET_ADDRESS },
        ] as const).map(c => (
          <div key={c.label} className="card notched-sm">
            <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
              style={{ color: 'var(--fg-subtle)' }}>{c.label}</p>
            {c.addr === '0x0000000000000000000000000000000000000000'
              ? <span className="badge badge-amber">Not deployed</span>
              : <a href={explorerAddr(c.addr)} target="_blank" rel="noreferrer"
                  className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                  {shortAddr(c.addr, 8)}
                </a>}
          </div>
        ))}
      </div>

      {!IS_DEPLOYED && (
        <div className="card-danger notched mb-8">
          <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--danger)' }}>Contracts Not Deployed</p>
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            Deploy the four contracts and update addresses in{' '}
            <code className="font-mono text-xs">src/aegis/config.ts</code>.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-8">
          <span className="spinner" />
          <span style={{ color: 'var(--fg-muted)' }}>Loading on-chain state…</span>
        </div>
      )}
      {error && <div className="card-danger mb-6"><p className="text-sm font-mono">{error}</p></div>}

      {/* Policies */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <p className="font-ui text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--fg-subtle)' }}>Policies ({policies.length})</p>
          <Link to="/policy/new" className="text-xs" style={{ color: 'var(--accent)' }}>+ New</Link>
        </div>
        <div className="card">
          {policies.length === 0 && !loading
            ? <p className="text-sm text-center py-6" style={{ color: 'var(--fg-subtle)' }}>No policies published yet.</p>
            : <table className="data-table">
                <thead><tr>
                  <th>Policy ID</th><th>Protocol</th><th>Owner</th><th>Version</th><th>Published</th>
                </tr></thead>
                <tbody>
                  {policies.map(p => (
                    <tr key={p.policy_id}>
                      <td>
                        <Link to={`/policy/${p.policy_id}`}
                          className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                          {p.policy_id}
                        </Link>
                      </td>
                      <td className="font-ui font-semibold text-sm">{p.protocol_name}</td>
                      <td className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                        {shortAddr(p.owner)}
                      </td>
                      <td><span className="badge badge-gray">v{p.version}</span></td>
                      <td className="text-xs" style={{ color: 'var(--fg-muted)' }}>{formatTs(p.published_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </div>
      </section>

      {/* Incidents */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <p className="font-ui text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--fg-subtle)' }}>Incidents ({incidents.length})</p>
          <Link to="/incident/new" className="text-xs" style={{ color: 'var(--accent)' }}>+ New</Link>
        </div>
        <div className="card">
          {incidents.length === 0 && !loading
            ? <p className="text-sm text-center py-6" style={{ color: 'var(--fg-subtle)' }}>No incidents opened yet.</p>
            : <table className="data-table">
                <thead><tr>
                  <th>Incident ID</th><th>Policy</th><th>Action</th><th>Status</th><th>Opened</th>
                </tr></thead>
                <tbody>
                  {incidents.map(i => (
                    <tr key={i.incident_id}>
                      <td>
                        <Link to={`/incident/${i.incident_id}`}
                          className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                          {i.incident_id}
                        </Link>
                      </td>
                      <td className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                        {i.policy_id}
                      </td>
                      <td><span className="badge badge-gray">{i.action_class}</span></td>
                      <td><IncidentStatusBadge status={i.status} /></td>
                      <td className="text-xs" style={{ color: 'var(--fg-muted)' }}>{formatTs(i.opened_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </div>
      </section>

      {/* Authority Tokens */}
      <section>
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: 'var(--fg-subtle)' }}>Authority Tokens ({tokens.length})</p>
        <div className="card">
          {tokens.length === 0 && !loading
            ? <p className="text-sm text-center py-6" style={{ color: 'var(--fg-subtle)' }}>No tokens issued yet.</p>
            : <table className="data-table">
                <thead><tr>
                  <th>Token ID</th><th>Holder</th><th>Action</th><th>State</th><th>Expires</th>
                </tr></thead>
                <tbody>
                  {tokens.map(t => (
                    <tr key={t.token_id}>
                      <td>
                        <Link to={`/token/${t.token_id}`}
                          className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                          {t.token_id}
                        </Link>
                      </td>
                      <td className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                        {shortAddr(t.holder)}
                      </td>
                      <td><span className="badge badge-gray">{t.action_class}</span></td>
                      <td><TokenStateBadge state={t.state} /></td>
                      <td className="text-xs" style={{ color: 'var(--fg-muted)' }}>{formatTs(t.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </div>
      </section>
    </div>
  );
}
