import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Engine, confirmTx } from '../aegis/client';
import { useTxMeta } from '../aegis/useTxMeta';
import { TxStatus } from '../components/TxStatus';
import { useWallet } from '../aegis/useWallet';
import { SCENARIOS, getRun } from '../aegis/demo';

const VALID_SLUG = /^[A-Za-z0-9._:-]{4,96}$/;

export function IncidentNewPage() {
  const meta = useTxMeta();
  const nav = useNavigate();
  const loc = useLocation();
  const { connected } = useWallet();

  const prefilledPolicy = (loc.state as { policyId?: string } | null)?.policyId ?? getRun()?.policyId ?? '';

  const [form, setForm] = useState({
    incidentId: '',
    policyId: prefilledPolicy,
    actionClass: 'SUSPEND_GUARDED_OPERATION',
    durationMinutes: 30,
    rationale: '',
    sourceUrls: ['', '', '', ''],
  });

  const [scenario, setScenario] = useState('');
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(k: string, v: string | number) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setUrl(i: number, v: string) {
    setForm(f => {
      const urls = [...f.sourceUrls];
      urls[i] = v;
      return { ...f, sourceUrls: urls };
    });
  }

  // Pick a demo scenario: fills the incident ID, rationale and evidence URLs.
  function applyScenario(key: string) {
    const sc = SCENARIOS.find(x => x.key === key);
    if (!sc) return;
    const run = getRun();
    const id = key === 'contradiction'
      ? (run?.contraIncidentId ?? `inc-contra-${Date.now().toString(36)}`)
      : (run?.incidentId ?? `inc-demo-${Date.now().toString(36)}`);
    setScenario(key);
    setForm(f => ({
      ...f,
      incidentId: id,
      policyId: f.policyId || run?.policyId || '',
      actionClass: 'SUSPEND_GUARDED_OPERATION',
      durationMinutes: 5,
      rationale: sc.rationale,
      sourceUrls: [...sc.urls, '', '', '', ''].slice(0, 4),
    }));
  }

  useEffect(() => {
    const st = loc.state as { scenario?: string } | null;
    if (st?.scenario) applyScenario(st.scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!VALID_SLUG.test(form.incidentId)) { setError('Incident ID must be 4–96 chars: A-Z a-z 0-9 . _ : -'); return; }
    if (!VALID_SLUG.test(form.policyId)) { setError('Policy ID must be 4–96 chars'); return; }
    const urls = form.sourceUrls.filter(u => u.trim());
    if (urls.length === 0) { setError('At least one source URL is required'); return; }
    setError(null); setBusy(true); setHash(null); meta.setResult(null);
    try {
      const txHash = await Engine.openIncident({
        incidentId: form.incidentId,
        policyId: form.policyId,
        actionClass: form.actionClass,
        durationMinutes: Number(form.durationMinutes),
        rationale: form.rationale,
        sourceUrlsJson: JSON.stringify(urls),
      });
      setHash(txHash);
      meta.setResult(await confirmTx(txHash, {
        onPhase: meta.setPhase,
        verify: async () => {
          const inc = await Engine.getIncident(form.incidentId);
          return inc && inc.status === 'OPEN' ? null : 'the incident is not readable from JudgmentEngine';
        },
      }));
      void nav(`/incident/${form.incidentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: 'var(--fg-subtle)' }}>Judgment Engine</p>
        <h1 className="font-ui font-bold text-3xl mb-2" style={{ color: 'var(--fg)' }}>
          Open Incident
        </h1>
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          Freezes the incident, requested action, and source URLs on-chain.
          Only the policy owner may open an incident. Sources must be approved policy hosts.
        </p>
      </div>

      <div className="mb-5">
        <label>Demo scenario (fills the incident ID, rationale and evidence URLs)</label>
        <select value={scenario} onChange={e => applyScenario(e.target.value)}>
          <option value="">Choose a scenario…</option>
          {SCENARIOS.map(sc => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
        </select>
        {scenario && (
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
            Expected: {SCENARIOS.find(x => x.key === scenario)?.expected}. The evidence files are static demo
            sources under docs/evidence/ in this repository.
          </p>
        )}
      </div>

      <form onSubmit={(e) => { void submit(e); }} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label>Incident ID</label>
            <input value={form.incidentId} onChange={e => { set('incidentId', e.target.value); }}
              placeholder="inc-exploit-2026" required />
            <span className="field-hint">Globally unique. 4–96 chars.</span>
          </div>
          <div className="field">
            <label>Policy ID</label>
            <input value={form.policyId} onChange={e => { set('policyId', e.target.value); }}
              placeholder="policy-myprotocol-v1" required />
            <span className="field-hint">Must be the active policy for the protocol.</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label>Action Class</label>
            <input value={form.actionClass} readOnly className="font-mono"
              style={{ color: 'var(--fg-muted)' }} />
          </div>
          <div className="field">
            <label>Duration (minutes)</label>
            <input type="number" value={form.durationMinutes} min={1}
              onChange={e => { set('durationMinutes', Number(e.target.value)); }} />
            <span className="field-hint">Must not exceed policy max suspend.</span>
          </div>
        </div>

        <div className="field">
          <label>Rationale (30–2400 chars)</label>
          <textarea value={form.rationale} onChange={e => { set('rationale', e.target.value); }}
            rows={4} required />
          <span className="field-hint">{form.rationale.length} / 2400 chars. Audit record only — not used as evidence.</span>
        </div>

        <div>
          <label className="font-ui text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--fg-muted)' }}>Source URLs (1–4, must be approved policy hosts)</label>
          <div className="flex flex-col gap-2 mt-2">
            {form.sourceUrls.map((u, i) => (
              <input key={i} value={u} onChange={e => { setUrl(i, e.target.value); }}
                placeholder={`https://approved-host.com/evidence-${i + 1}`}
                className="font-mono"
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                  color: 'var(--fg)', background: 'var(--bg-01)',
                  border: '1px solid var(--border)', borderRadius: 4,
                  padding: '0.5rem 0.75rem', outline: 'none', width: '100%',
                }} />
            ))}
          </div>
          <p className="field-hint mt-1">Leave extra fields empty. URLs are canonicalized and frozen on-chain.</p>
        </div>

        <TxStatus hash={hash} error={error} waiting={busy} phase={meta.phase} result={meta.result} label="Incident open" />

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn btn-danger notched" disabled={busy || !connected}>
            {busy ? <><span className="spinner" /> Opening Incident…</> : 'Freeze Incident On-Chain'}
          </button>
          {!connected && (
            <span className="text-xs self-center" style={{ color: 'var(--fg-muted)' }}>Connect wallet first</span>
          )}
        </div>
      </form>
    </div>
  );
}
