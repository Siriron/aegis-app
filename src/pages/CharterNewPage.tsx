import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vault, waitForReceipt } from '../aegis/client';
import { TARGET_ADDRESS, ZERO_ADDRESS } from '../aegis/config';
import { TxStatus } from '../components/TxStatus';
import { useWallet } from '../aegis/useWallet';

const VALID_SLUG = /^[A-Za-z0-9._:-]{4,96}$/;

const DEMO_TRIGGER = `An active exploit is in progress against the protected protocol. This condition is met when at least one credible on-chain security monitor or public disclosure source reports an ongoing attack, fund drain, or critical vulnerability being actively exploited. The evidence must be dated within the past 24 hours and must reference the exact protected protocol by name or contract address.`;

const DEMO_SOURCE_RULES = `Evidence must come from approved source hosts only. Each source must be a publicly accessible HTTPS URL. The validator must fetch the page and find a direct reference to the incident. A single credible source reporting the active exploit is sufficient if the content is unambiguous. Security disclosure blogs and monitoring dashboards are acceptable.`;

export function CharterNewPage() {
  const nav = useNavigate();
  const { connected } = useWallet();

  const [form, setForm] = useState({
    policyId: '',
    protocolId: '',
    protocolName: '',
    guardedTarget: TARGET_ADDRESS !== ZERO_ADDRESS ? TARGET_ADDRESS : '',
    triggerRules: '',
    sourceRules: '',
    allowedSourcesCsv: '',
    maxSuspendMinutes: 60,
    authorityTtlMinutes: 30,
    activationDelayMinutes: 2,
  });

  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(k: string, v: string | number) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function autofill() {
    setForm(f => ({
      ...f,
      policyId: `policy-demo-${Date.now().toString(36)}`,
      protocolId: 'aegis-demo-protocol',
      protocolName: 'Aegis Demo Protocol',
      triggerRules: DEMO_TRIGGER,
      sourceRules: DEMO_SOURCE_RULES,
      allowedSourcesCsv: 'rekt.news,blog.openzeppelin.com,github.com',
      activationDelayMinutes: 2,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!VALID_SLUG.test(form.policyId)) { setError('Policy ID must be 4–96 chars: A-Z a-z 0-9 . _ : -'); return; }
    if (!VALID_SLUG.test(form.protocolId)) { setError('Protocol ID must be 4–96 chars: A-Z a-z 0-9 . _ : -'); return; }
    setError(null); setBusy(true); setHash(null);
    try {
      const txHash = await Vault.publishPolicy({
        policyId: form.policyId,
        protocolId: form.protocolId,
        protocolName: form.protocolName,
        guardedTarget: form.guardedTarget,
        triggerRules: form.triggerRules,
        sourceRules: form.sourceRules,
        allowedSourcesCsv: form.allowedSourcesCsv,
        maxSuspendMinutes: Number(form.maxSuspendMinutes),
        authorityTtlMinutes: Number(form.authorityTtlMinutes),
        activationDelayMinutes: Number(form.activationDelayMinutes),
      });
      setHash(txHash);
      await waitForReceipt(txHash);
      void nav(`/policy/${form.policyId}`);
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
          style={{ color: 'var(--fg-subtle)' }}>Policy Vault</p>
        <h1 className="font-ui font-bold text-3xl mb-2" style={{ color: 'var(--fg)' }}>
          Publish Policy
        </h1>
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          Immutable once published. The first publisher claims the protocol ID.
          Activation delay must elapse before any incident can reference this policy.
        </p>
      </div>

      <div className="flex justify-end mb-4">
        <button className="btn btn-ghost notched-sm text-xs" onClick={autofill} type="button">
          Autofill Demo
        </button>
      </div>

      <form onSubmit={(e) => { void submit(e); }} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label>Policy ID</label>
            <input value={form.policyId} onChange={e => { set('policyId', e.target.value); }}
              placeholder="policy-myprotocol-v1" required />
            <span className="field-hint">Globally unique. 4–96 chars: A-Z a-z 0-9 . _ : -</span>
          </div>
          <div className="field">
            <label>Protocol ID</label>
            <input value={form.protocolId} onChange={e => { set('protocolId', e.target.value); }}
              placeholder="my-protocol" required />
            <span className="field-hint">First publisher claims this ID.</span>
          </div>
        </div>

        <div className="field">
          <label>Protocol Name</label>
          <input value={form.protocolName} onChange={e => { set('protocolName', e.target.value); }}
            placeholder="My Protocol" required />
        </div>

        <div className="field">
          <label>Guarded Target Address</label>
          <input value={form.guardedTarget} onChange={e => { set('guardedTarget', e.target.value); }}
            placeholder="0x…" className="font-mono" required />
          <span className="field-hint">Must be the GuardedTarget address. Policy owner must match target governance.</span>
        </div>

        <div className="field">
          <label>Trigger Rules (80–5000 chars)</label>
          <textarea value={form.triggerRules} onChange={e => { set('triggerRules', e.target.value); }}
            rows={5} required placeholder={DEMO_TRIGGER} />
          <span className="field-hint">{form.triggerRules.length} / 5000 chars</span>
        </div>

        <div className="field">
          <label>Source Evaluation Rules (40–3000 chars)</label>
          <textarea value={form.sourceRules} onChange={e => { set('sourceRules', e.target.value); }}
            rows={3} required placeholder={DEMO_SOURCE_RULES} />
          <span className="field-hint">{form.sourceRules.length} / 3000 chars</span>
        </div>

        <div className="field">
          <label>Approved Source Hosts (comma-separated, 1–8 hosts)</label>
          <input value={form.allowedSourcesCsv} onChange={e => { set('allowedSourcesCsv', e.target.value); }}
            placeholder="rekt.news,github.com,blog.openzeppelin.com" required />
          <span className="field-hint">Exact hostnames only, no protocols or paths.</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="field">
            <label>Max Suspend (min)</label>
            <input type="number" value={form.maxSuspendMinutes} min={5} max={1440}
              onChange={e => { set('maxSuspendMinutes', Number(e.target.value)); }} />
            <span className="field-hint">5–1440</span>
          </div>
          <div className="field">
            <label>Authority TTL (min)</label>
            <input type="number" value={form.authorityTtlMinutes} min={5} max={120}
              onChange={e => { set('authorityTtlMinutes', Number(e.target.value)); }} />
            <span className="field-hint">5–120</span>
          </div>
          <div className="field">
            <label>Activation Delay (min)</label>
            <input type="number" value={form.activationDelayMinutes} min={1} max={10080}
              onChange={e => { set('activationDelayMinutes', Number(e.target.value)); }} />
            <span className="field-hint">1 min – 7 days</span>
          </div>
        </div>

        <TxStatus hash={hash} error={error} waiting={busy} label="Policy publish" />

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn btn-primary notched" disabled={busy || !connected}>
            {busy ? <><span className="spinner" /> Publishing…</> : 'Publish Policy'}
          </button>
          {!connected && (
            <span className="text-xs self-center" style={{ color: 'var(--fg-muted)' }}>
              Connect wallet to publish
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
