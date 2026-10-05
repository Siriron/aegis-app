import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Gate, waitForReceipt } from '../aegis/client';
import { explorerAddr } from '../aegis/config';
import { TokenStateBadge } from '../components/StatusBadge';
import { TxStatus } from '../components/TxStatus';
import { useWallet } from '../aegis/useWallet';
import { shortAddr, formatTs, formatCountdown } from '../utils/format';
import type { AuthorityToken } from '../aegis/types';

export function TokenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { address } = useWallet();
  const [token, setToken] = useState<AuthorityToken | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react/purity
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        setToken(await Gate.getToken(id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    const t = setInterval(() => { setNow(Math.floor(Date.now() / 1000)); }, 1000);
    return () => { clearInterval(t); };
  }, []);

  async function execute() {
    if (!token || !id) return;
    setBusy(true); setError(null); setHash(null);
    try {
      const txHash = await Gate.executeToken({
        tokenId: id,
        target: token.target,
        actionClass: token.action_class,
        durationMinutes: token.duration_minutes,
      });
      setHash(txHash);
      await waitForReceipt(txHash, 180_000);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (!id) return;
    setBusy(true); setError(null);
    try {
      const txHash = await Gate.syncToken(id);
      setHash(txHash);
      await waitForReceipt(txHash);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-16 flex items-center gap-3">
      <span className="spinner" /><span style={{ color: 'var(--fg-muted)' }}>Loading token…</span>
    </div>
  );

  if (!token) return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="card-danger"><p>Token not found: <code className="font-mono">{id}</code></p></div>
    </div>
  );

  const expired = now > token.expires_at;
  const isHolder = address?.toLowerCase() === token.holder.toLowerCase();
  const canExecute = isHolder && token.state === 'ISSUED' && !expired;
  const canSync = isHolder && token.state === 'DISPATCHED';

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/command" className="text-xs mb-6 inline-block" style={{ color: 'var(--fg-muted)' }}>
        ← Command
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
            style={{ color: 'var(--fg-subtle)' }}>Authority Token</p>
          <h1 className="font-ui font-bold text-2xl mb-1" style={{ color: 'var(--fg)' }}>
            {token.token_id}
          </h1>
          <code className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            Incident: {token.incident_id}
          </code>
        </div>
        <TokenStateBadge state={token.state} />
      </div>

      <div className="card-danger notched mb-6">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: 'var(--danger)' }}>Finality Required</p>
        <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
          ACCEPTED is never authority. This token is executable only after the parent
          judgment transaction has reached FINALIZED on-chain.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Holder',     value: shortAddr(token.holder, 10) },
          { label: 'Target',     value: shortAddr(token.target, 10) },
          { label: 'Action',     value: token.action_class },
          { label: 'Duration',   value: `${token.duration_minutes} min` },
          { label: 'Issued',     value: formatTs(token.issued_at) },
          { label: 'Expires',    value: expired ? 'Expired' : formatCountdown(token.expires_at, now) },
          { label: 'Applied At', value: token.applied_at ? formatTs(token.applied_at) : '—' },
          { label: 'State',      value: token.state },
        ].map(m => (
          <div key={m.label} className="card notched-sm">
            <p className="font-ui text-xs uppercase tracking-widest mb-0.5"
              style={{ color: 'var(--fg-subtle)' }}>{m.label}</p>
            <p className="font-mono text-xs" style={{ color: 'var(--fg)' }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="card mb-6">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: 'var(--fg-subtle)' }}>Binding Digests</p>
        {[
          { label: 'OP DIGEST',        value: token.op_digest },
          { label: 'POLICY HASH',      value: token.policy_hash },
          { label: 'JUDGMENT DIGEST',  value: token.judgment_digest },
        ].map(d => (
          <div key={d.label} className="mb-2">
            <p className="font-ui text-xs uppercase tracking-widest mb-0.5"
              style={{ color: 'var(--fg-subtle)' }}>{d.label}</p>
            <p className="font-mono text-xs break-all" style={{ color: 'var(--fg-muted)' }}>{d.value}</p>
          </div>
        ))}
      </div>

      <a href={explorerAddr(token.target)} target="_blank" rel="noreferrer"
        className="btn btn-ghost notched-sm text-xs mb-6 inline-flex">
        View Target on Explorer ↗
      </a>

      <div className="card-accent notched">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
          style={{ color: 'var(--accent)' }}>Execute Token</p>
        <p className="text-sm mb-3" style={{ color: 'var(--fg-muted)' }}>
          The Gate recomputes the op digest before dispatch. The target reconciles the
          finalized child before the token becomes APPLIED. Single-use — replay is rejected.
        </p>
        <div className="flex gap-3 flex-wrap">
          {canExecute && (
            <button className="btn btn-primary notched-sm" onClick={() => { void execute(); }} disabled={busy}>
              {busy ? <><span className="spinner" /> Executing…</> : 'Execute Token'}
            </button>
          )}
          {canSync && (
            <button className="btn btn-outline-accent notched-sm" onClick={() => { void sync(); }} disabled={busy}>
              {busy ? <><span className="spinner" /> Syncing…</> : 'Sync Status'}
            </button>
          )}
          {token.state === 'APPLIED' && (
            <span className="badge badge-green text-sm px-4 py-2">Token Applied</span>
          )}
          <button className="btn btn-ghost notched-sm" onClick={load} disabled={busy}>Refresh</button>
        </div>
        {!isHolder && (
          <p className="text-xs mt-2" style={{ color: 'var(--fg-subtle)' }}>
            Only the holder ({shortAddr(token.holder)}) may execute this token.
          </p>
        )}
        {expired && token.state === 'ISSUED' && (
          <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>
            This token has expired and can no longer be executed.
          </p>
        )}
        <TxStatus hash={hash} error={error} waiting={busy} label="Token execution" />
      </div>
    </div>
  );
}
