import { useState, useEffect } from 'react';
import { Target, waitForReceipt } from '../aegis/client';
import { explorerAddr, TARGET_ADDRESS, IS_DEPLOYED } from '../aegis/config';
import { TxStatus } from '../components/TxStatus';
import { useWallet } from '../aegis/useWallet';
import { formatTs, shortAddr } from '../utils/format';
import type { TargetStatus } from '../aegis/types';

export function TargetPage() {
  const { address } = useWallet();
  const [status, setStatus] = useState<TargetStatus | null>(null);
  const [signalKeys, setSignalKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line react/purity
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [signalKey, setSignalKey] = useState('');
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!IS_DEPLOYED) return;
    setLoading(true);
    void (async () => {
      try {
        const [s, keys] = await Promise.all([Target.getStatus(), Target.listSignalKeys()]);
        setStatus(s);
        setSignalKeys(keys);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    const t = setInterval(() => { setNow(Math.floor(Date.now() / 1000)); }, 1000);
    return () => { clearInterval(t); };
  }, []);

  async function recordSignal(e: React.FormEvent) {
    e.preventDefault();
    if (!signalKey.trim()) { setError('Signal key is required'); return; }
    setBusy(true); setError(null); setHash(null);
    try {
      const txHash = await Target.recordSignal(signalKey.trim());
      setHash(txHash);
      await waitForReceipt(txHash);
      setSignalKey('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signal failed');
    } finally {
      setBusy(false);
    }
  }

  const isSuspended = status ? now < status.suspended_until : false;
  const isGovernance = address && status
    ? address.toLowerCase() === status.governance_address.toLowerCase()
    : false;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: 'var(--fg-subtle)' }}>Guarded Target</p>
        <h1 className="font-ui font-bold text-3xl mb-2" style={{ color: 'var(--fg)' }}>
          Protected Operation Target
        </h1>
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          Non-custodial. No deposits, no payouts. Records one authoritative signal per unique key
          and can be suspended exclusively by a finalized AuthorityGate execution. No admin bypass.
        </p>
      </div>

      {!IS_DEPLOYED && (
        <div className="card-danger notched mb-6">
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            Target contract not deployed yet. Update{' '}
            <code className="font-mono text-xs">src/aegis/config.ts</code>.
          </p>
        </div>
      )}

      {status && (
        <>
          {isSuspended ? (
            <div className="card-danger notched mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="pulse-dot-red" />
                <p className="font-ui text-sm font-bold uppercase tracking-widest"
                  style={{ color: 'var(--danger)' }}>GUARDED OPERATION SUSPENDED</p>
              </div>
              <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                Emergency suspension active until{' '}
                <strong style={{ color: 'var(--danger)' }}>
                  {formatTs(status.suspended_until)}
                </strong>.
                Any attempt to record a signal will be rejected on-chain.
              </p>
            </div>
          ) : (
            <div className="card mb-6" style={{ borderColor: 'var(--success)' }}>
              <div className="flex items-center gap-2">
                <span className="pulse-dot" />
                <p className="font-ui text-sm font-bold uppercase tracking-widest"
                  style={{ color: 'var(--success)' }}>Guarded Operation Active</p>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
                No emergency suspension in effect. Signals record normally.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: 'Gate Address',  value: shortAddr(status.gate_address, 10) },
              { label: 'Governance',    value: shortAddr(status.governance_address, 10) },
              { label: 'Signal Count',  value: String(status.signal_count) },
              { label: 'Suspensions',   value: String(status.suspension_count) },
            ].map(m => (
              <div key={m.label} className="card notched-sm">
                <p className="font-ui text-xs uppercase tracking-widest mb-0.5"
                  style={{ color: 'var(--fg-subtle)' }}>{m.label}</p>
                <p className="font-mono text-xs" style={{ color: 'var(--fg)' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {status.last_signal_json && (
            <div className="card mb-6">
              <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
                style={{ color: 'var(--fg-subtle)' }}>Last Recorded Signal</p>
              <pre className="font-mono text-xs" style={{ color: 'var(--fg-muted)', whiteSpace: 'pre-wrap' }}>
                {status.last_signal_json}
              </pre>
            </div>
          )}

          {signalKeys.length > 0 && (
            <div className="card mb-6">
              <p className="font-ui text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: 'var(--fg-subtle)' }}>Recorded Signal Keys ({signalKeys.length})</p>
              <div className="flex flex-wrap gap-2">
                {signalKeys.map(k => (
                  <span key={k} className="badge badge-gray font-mono">{k}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-4">
          <span className="spinner" />
          <span style={{ color: 'var(--fg-muted)' }}>Loading target state…</span>
        </div>
      )}

      {IS_DEPLOYED && (
        <a href={explorerAddr(TARGET_ADDRESS)} target="_blank" rel="noreferrer"
          className="btn btn-ghost notched-sm text-xs mb-6 inline-flex">
          View Target on Explorer ↗
        </a>
      )}

      <div className="card-accent notched">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
          style={{ color: 'var(--accent)' }}>Record Signal</p>
        <p className="text-sm mb-4" style={{ color: 'var(--fg-muted)' }}>
          Records one unique authoritative signal. Each key executes once only.
          Requires a direct EOA call. Will be rejected if the target is suspended.
        </p>

        {isSuspended && (
          <div className="badge badge-red mb-4">Guarded operation is suspended — transaction will revert</div>
        )}

        <form onSubmit={(e) => { void recordSignal(e); }} className="flex gap-3">
          <div className="field flex-1">
            <label>Signal Key</label>
            <input value={signalKey} onChange={e => { setSignalKey(e.target.value); }}
              placeholder="signal-unique-key-001" className="font-mono" />
            <span className="field-hint">Max 128 chars. Must be globally unique on this target.</span>
          </div>
          <div className="flex items-end pb-5">
            <button type="submit" className="btn btn-primary notched-sm"
              disabled={busy || !address || isSuspended}>
              {busy ? <><span className="spinner" /> Recording…</> : 'Record'}
            </button>
          </div>
        </form>

        {!isGovernance && address && (
          <p className="text-xs mt-2" style={{ color: 'var(--fg-subtle)' }}>
            Note: governance address is {shortAddr(status?.governance_address ?? '')} — any EOA may record signals.
          </p>
        )}

        <TxStatus hash={hash} error={error} waiting={busy} label="Signal record" />

        <div className="flex gap-2 mt-4">
          <button className="btn btn-ghost notched-sm text-xs" onClick={load} disabled={busy}>
            Refresh State
          </button>
        </div>
      </div>
    </div>
  );
}
