import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Engine, parseVerdict, waitForReceipt } from '../aegis/client';
import { explorerTx } from '../aegis/config';
import { IncidentStatusBadge, VerdictBadge, SourceStateBadge } from '../components/StatusBadge';
import { TxStatus } from '../components/TxStatus';
import { useWallet } from '../aegis/useWallet';
import { shortAddr, formatTs, formatCountdown } from '../utils/format';
import type { Incident, JudgmentResult } from '../aegis/types';

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { address } = useWallet();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [verdict, setVerdict] = useState<JudgmentResult | null>(null);
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
        const inc = await Engine.getIncident(id);
        setIncident(inc);
        if (inc) setVerdict(parseVerdict(inc));
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

  async function judge() {
    if (!id) return;
    setBusy(true); setError(null); setHash(null);
    try {
      const txHash = await Engine.judgeIncident(id);
      setHash(txHash);
      await waitForReceipt(txHash, 180_000);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Judgment failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-16 flex items-center gap-3">
      <span className="spinner" /><span style={{ color: 'var(--fg-muted)' }}>Loading incident…</span>
    </div>
  );

  if (!incident) return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="card-danger"><p>Incident not found: <code className="font-mono">{id}</code></p></div>
    </div>
  );

  const isOpener = address?.toLowerCase() === incident.opener.toLowerCase();
  const expired = now > incident.expires_at;
  const canJudge = isOpener && !expired &&
    (incident.status === 'OPEN' || incident.status === 'RETRYABLE') &&
    incident.judgment_count < 3;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/command" className="text-xs mb-6 inline-block" style={{ color: 'var(--fg-muted)' }}>
        ← Command
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
            style={{ color: 'var(--fg-subtle)' }}>Incident</p>
          <h1 className="font-ui font-bold text-2xl mb-1" style={{ color: 'var(--fg)' }}>
            {incident.incident_id}
          </h1>
          <code className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            Policy: {incident.policy_id}
          </code>
        </div>
        <IncidentStatusBadge status={incident.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Opener',          value: shortAddr(incident.opener, 10) },
          { label: 'Target',          value: shortAddr(incident.target, 10) },
          { label: 'Action',          value: incident.action_class },
          { label: 'Duration',        value: `${incident.duration_minutes} min` },
          { label: 'Opened',          value: formatTs(incident.opened_at) },
          { label: 'Expires',         value: expired ? 'Expired' : formatCountdown(incident.expires_at, now) },
          { label: 'Judgments',       value: `${incident.judgment_count} / 3` },
          { label: 'Token ID',        value: incident.token_id || '—' },
        ].map(m => (
          <div key={m.label} className="card notched-sm">
            <p className="font-ui text-xs uppercase tracking-widest mb-0.5"
              style={{ color: 'var(--fg-subtle)' }}>{m.label}</p>
            <p className="font-mono text-xs" style={{ color: 'var(--fg)' }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="card mb-4">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
          style={{ color: 'var(--fg-subtle)' }}>Operator Rationale</p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-muted)' }}>{incident.rationale}</p>
      </div>

      <div className="card mb-6">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: 'var(--fg-subtle)' }}>Frozen Source URLs</p>
        <div className="flex flex-col gap-2">
          {incident.source_urls.map(u => (
            <a key={u} href={u} target="_blank" rel="noreferrer"
              className="font-mono text-xs break-all" style={{ color: 'var(--accent)' }}>{u}</a>
          ))}
        </div>
      </div>

      {/* Verdict result */}
      {verdict && (
        <div className="card-accent notched mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-ui text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--accent)' }}>Judgment Result</p>
            <VerdictBadge verdict={verdict.verdict} />
          </div>

          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--fg)' }}>
            {verdict.rationale}
          </p>

          {verdict.matched_rules.length > 0 && (
            <div className="mb-4">
              <p className="font-ui text-xs uppercase tracking-widest mb-2"
                style={{ color: 'var(--fg-subtle)' }}>Matched Trigger Rules</p>
              <ul className="list-disc list-inside">
                {verdict.matched_rules.map((r, i) => (
                  <li key={i} className="text-xs mb-1" style={{ color: 'var(--fg-muted)' }}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {verdict.key_findings.length > 0 && (
            <div className="mb-4">
              <p className="font-ui text-xs uppercase tracking-widest mb-2"
                style={{ color: 'var(--fg-subtle)' }}>Key Findings</p>
              <ul className="list-disc list-inside">
                {verdict.key_findings.map((f, i) => (
                  <li key={i} className="text-xs mb-1" style={{ color: 'var(--fg-muted)' }}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="font-ui text-xs uppercase tracking-widest mb-2"
            style={{ color: 'var(--fg-subtle)' }}>Source States</p>
          <div className="flex flex-col gap-2">
            {verdict.source_states.map(s => (
              <div key={s.url} className="card notched-sm">
                <div className="flex items-center justify-between mb-1">
                  <a href={s.url} target="_blank" rel="noreferrer"
                    className="font-mono text-xs break-all" style={{ color: 'var(--accent)' }}>
                    {s.url}
                  </a>
                  <SourceStateBadge state={s.state} />
                </div>
                <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{s.finding}</p>
                {s.content_digest && (
                  <p className="font-mono text-xs mt-1" style={{ color: 'var(--fg-subtle)' }}>
                    SHA256: {s.content_digest.slice(0, 16)}…
                  </p>
                )}
              </div>
            ))}
          </div>

          {verdict.gov_note && (
            <div className="mt-4 card-danger">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--danger)' }}>
                {verdict.gov_status}
              </p>
              <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{verdict.gov_note}</p>
            </div>
          )}

          <div className="code-block mt-4 text-xs">
            <span style={{ color: 'var(--fg-subtle)' }}>VERDICT DIGEST </span>
            {incident.verdict_digest}
          </div>
        </div>
      )}

      {/* Token link */}
      {incident.token_id && (
        <div className="card mb-6" style={{ borderColor: 'var(--success)' }}>
          <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--success)' }}>Authority Token Issued</p>
          <p className="text-sm mb-3" style={{ color: 'var(--fg-muted)' }}>
            ACCEPTED is not authority. The token is executable only after the judgment
            transaction reaches FINALIZED on-chain.
          </p>
          <Link to={`/token/${incident.token_id}`}
            className="btn btn-primary notched-sm text-xs">
            View Authority Token →
          </Link>
        </div>
      )}

      {/* Judge action */}
      <div className="card-accent notched">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
          style={{ color: 'var(--accent)' }}>Request Judgment</p>
        <p className="text-sm mb-3" style={{ color: 'var(--fg-muted)' }}>
          Validators independently fetch source URLs and assess against the frozen policy rules.
          Takes 20–120 seconds. Only the incident opener may trigger judgment.
          Retryable up to 3 times on WEAK_EVIDENCE or CONFLICTING.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-primary notched-sm"
            onClick={() => { void judge(); }}
            disabled={busy || !canJudge}>
            {busy ? <><span className="spinner" /> Judging…</> : 'Request Judgment'}
          </button>
          <button className="btn btn-ghost notched-sm" onClick={load} disabled={busy}>
            Refresh
          </button>
        </div>
        {!isOpener && (
          <p className="text-xs mt-2" style={{ color: 'var(--fg-subtle)' }}>
            Only the opener ({shortAddr(incident.opener)}) may trigger judgment.
          </p>
        )}
        {incident.status === 'AUTHORITY_PENDING' && (
          <div className="mt-3">
            <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
              style={{ color: 'var(--warn)' }}>Awaiting Finality</p>
            <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              ACCEPTED is not authority. The token is issued only after the judgment
              transaction reaches FINALIZED on-chain.
            </p>
            {hash && (
              <a href={explorerTx(hash)} target="_blank" rel="noreferrer"
                className="text-xs mt-1 inline-block" style={{ color: 'var(--accent)' }}>
                Check on explorer ↗
              </a>
            )}
          </div>
        )}
        <TxStatus hash={hash} error={error} waiting={busy} label="Judgment" />
      </div>
    </div>
  );
}
