import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Vault, waitForReceipt } from '../aegis/client';
import { explorerAddr } from '../aegis/config';
import { ActiveBadge } from '../components/StatusBadge';
import { TxStatus } from '../components/TxStatus';
import { useWallet } from '../aegis/useWallet';
import { shortAddr, formatTs, formatCountdown } from '../utils/format';
import type { Policy } from '../aegis/types';

export function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { address } = useWallet();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react/purity
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const [p, active] = await Promise.all([
          Vault.getPolicy(id),
          Vault.isActive(id),
        ]);
        setPolicy(p);
        setIsActive(active);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    const t = setInterval(() => { setNow(Math.floor(Date.now() / 1000)); }, 1000);
    return () => { clearInterval(t); };
  }, []);

  async function activate() {
    if (!id) return;
    setBusy(true); setError(null); setHash(null);
    try {
      const txHash = await Vault.activatePolicy(id);
      setHash(txHash);
      await waitForReceipt(txHash);
      setIsActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-16 flex items-center gap-3">
      <span className="spinner" /><span style={{ color: 'var(--fg-muted)' }}>Loading policy…</span>
    </div>
  );

  if (!policy) return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="card-danger"><p>Policy not found: <code className="font-mono">{id}</code></p></div>
    </div>
  );

  const readyIn = policy.ready_after - now;
  const canActivate = !isActive && address?.toLowerCase() === policy.owner.toLowerCase() && readyIn <= 0;
  const isOwner = address?.toLowerCase() === policy.owner.toLowerCase();

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/command" className="text-xs mb-6 inline-block" style={{ color: 'var(--fg-muted)' }}>
        ← Command
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
            style={{ color: 'var(--fg-subtle)' }}>Policy</p>
          <h1 className="font-ui font-bold text-2xl mb-1" style={{ color: 'var(--fg)' }}>
            {policy.protocol_name}
          </h1>
          <code className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>{policy.policy_id}</code>
        </div>
        <ActiveBadge active={isActive} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Protocol ID',     value: policy.protocol_id },
          { label: 'Version',         value: `v${policy.version}` },
          { label: 'Owner',           value: shortAddr(policy.owner, 10) },
          { label: 'Guarded Target',  value: shortAddr(policy.guarded_target, 10) },
          { label: 'Published',       value: formatTs(policy.published_at) },
          { label: 'Ready After',     value: readyIn > 0 ? `${formatCountdown(policy.ready_after, now)} remaining` : 'Ready now' },
          { label: 'Max Suspend',     value: `${policy.max_suspend_minutes} min` },
          { label: 'Authority TTL',   value: `${policy.authority_ttl_minutes} min` },
        ].map(m => (
          <div key={m.label} className="card notched-sm">
            <p className="font-ui text-xs uppercase tracking-widest mb-0.5"
              style={{ color: 'var(--fg-subtle)' }}>{m.label}</p>
            <p className="font-mono text-xs" style={{ color: 'var(--fg)' }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="card mb-4">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: 'var(--fg-subtle)' }}>Approved Source Hosts</p>
        <div className="flex flex-wrap gap-2">
          {policy.allowed_sources.map(h => (
            <span key={h} className="badge badge-cyan font-mono">{h}</span>
          ))}
        </div>
      </div>

      <div className="card mb-4">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
          style={{ color: 'var(--fg-subtle)' }}>Trigger Rules</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-muted)' }}>{policy.trigger_rules}</p>
      </div>

      <div className="card mb-4">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
          style={{ color: 'var(--fg-subtle)' }}>Source Evaluation Rules</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-muted)' }}>{policy.source_rules}</p>
      </div>

      <div className="code-block mb-6">
        <span style={{ color: 'var(--fg-subtle)' }}>POLICY HASH </span>
        {policy.policy_hash}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <a href={explorerAddr(policy.guarded_target)} target="_blank" rel="noreferrer"
          className="btn btn-ghost notched-sm text-xs">
          View Target on Explorer ↗
        </a>
        {isOwner && (
          <button className="btn btn-outline-accent notched-sm text-xs"
            onClick={() => { void nav('/incident/new', { state: { policyId: policy.policy_id } }); }}>
            Open Incident with this Policy
          </button>
        )}
      </div>

      {!isActive && isOwner && (
        <div className="card-accent notched">
          <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--accent)' }}>Activate Policy</p>
          {readyIn > 0
            ? <p className="text-sm mb-3" style={{ color: 'var(--fg-muted)' }}>
                Activation delay not elapsed.
                Ready in <strong style={{ color: 'var(--accent)' }}>{formatCountdown(policy.ready_after, now)}</strong>.
              </p>
            : <p className="text-sm mb-3" style={{ color: 'var(--fg-muted)' }}>
                Activation delay elapsed. This policy is ready to be made active for future incidents.
              </p>}
          <button className="btn btn-primary notched-sm"
            onClick={() => { void activate(); }}
            disabled={busy || !canActivate}>
            {busy ? <><span className="spinner" /> Activating…</> : 'Activate Policy'}
          </button>
          <TxStatus hash={hash} error={error} waiting={busy} label="Policy activation" />
        </div>
      )}
    </div>
  );
}
