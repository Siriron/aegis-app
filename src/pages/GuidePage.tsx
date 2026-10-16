import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Engine, Gate, Target, Vault } from '../aegis/client';
import { TARGET_ADDRESS, explorerAddr } from '../aegis/config';
import { useWallet } from '../aegis/useWallet';
import {
  clearRun, getRun, newRun, readTxLog, txLogText,
  type LoggedTx, type Run,
} from '../aegis/demo';
import type { Incident, TargetStatus } from '../aegis/types';

type StepState = 'done' | 'next' | 'todo';

interface Step {
  n: string;
  title: string;
  what: string;
  link?: { to: string; state?: unknown; label: string };
  done: boolean;
  detail?: string;
}

const sameAddr = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function GuidePage() {
  const { address, connected } = useWallet();
  const [run, setRun] = useState<Run | null>(getRun());
  const [log, setLog] = useState<LoggedTx[]>(readTxLog());
  const [gov, setGov] = useState<string>('');
  const [active, setActive] = useState(false);
  const [policyOk, setPolicyOk] = useState(false);
  const [readyAfter, setReadyAfter] = useState(0);
  const [inc, setInc] = useState<Incident | null>(null);
  const [contra, setContra] = useState<Incident | null>(null);
  const [tokenState, setTokenState] = useState('');
  const [target, setTarget] = useState<TargetStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const refresh = useCallback(async () => {
    setLog(readTxLog());
    setNow(Math.floor(Date.now() / 1000));
    try { setGov(await Target.getGovernanceAddress()); } catch { /* read failed */ }
    try { setTarget(await Target.getStatus()); } catch { /* read failed */ }
    const r = getRun();
    if (!r) return;
    try {
      const p = await Vault.getPolicy(r.policyId);
      setPolicyOk(!!p);
      setReadyAfter(p ? Number(p.ready_after ?? 0) : 0);
      setActive(p ? await Vault.isActive(r.policyId) : false);
    } catch { /* read failed */ }
    try {
      const i = await Engine.getIncident(r.incidentId);
      setInc(i);
      if (i?.token_id) { const t = await Gate.getToken(i.token_id); setTokenState(t?.state ?? ''); } else setTokenState('');
    } catch { /* read failed */ }
    try { setContra(await Engine.getIncident(r.contraIncidentId)); } catch { /* read failed */ }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { void refresh(); }, 20000);   // StudioNet is rate limited: no faster
    return () => clearInterval(id);
  }, [refresh]);

  function start() {
    setRun(newRun(address));
    setLog([]);
    setPolicyOk(false); setActive(false); setInc(null); setContra(null); setTokenState('');
    void refresh();
  }

  function reset() {
    clearRun();
    setRun(null);
    setLog([]);
    setPolicyOk(false); setActive(false); setInc(null); setContra(null); setTokenState('');
  }

  async function copyLog() {
    try { await navigator.clipboard.writeText(txLogText(log)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }

  const isGov = connected && sameAddr(address, gov);
  const verdict = (() => {
    try { return inc?.verdict_json ? (JSON.parse(inc.verdict_json) as { verdict?: string }).verdict ?? '' : ''; } catch { return ''; }
  })();
  const contraVerdict = (() => {
    try { return contra?.verdict_json ? (JSON.parse(contra.verdict_json) as { verdict?: string }).verdict ?? '' : ''; } catch { return ''; }
  })();
  const suspended = !!target && now < target.suspended_until;
  const delayLeft = Math.max(0, readyAfter - now);

  const steps: Step[] = run ? [
    {
      n: '1', title: 'Publish the policy',
      what: `Policy ${run.policyId} for protocol ${run.protocolId}. The form opens pre-filled; just press Publish.`,
      link: { to: '/policy/new', state: { autofill: true }, label: 'Open pre-filled form' },
      done: policyOk,
    },
    {
      n: '2', title: 'Activate the policy',
      what: delayLeft > 0 ? `Wait ${Math.ceil(delayLeft / 60)} more minute(s) for the activation delay, then activate.` : 'Open the policy page and press Activate.',
      link: { to: `/policy/${run.policyId}`, label: 'Open policy' },
      done: active,
    },
    {
      n: '3', title: 'Open the incident',
      what: 'Pick the scenario "Confirmed exploit" (pre-selected); press Open Incident.',
      link: { to: '/incident/new', state: { policyId: run.policyId, scenario: 'confirmed' }, label: 'Open pre-filled form' },
      done: !!inc,
    },
    {
      n: '4', title: 'Judge the incident',
      what: 'Press Judge and wait until the page says finalized and verified (a few minutes: validators fetch the evidence and run the model).',
      link: { to: `/incident/${run.incidentId}`, label: 'Open incident' },
      done: !!verdict,
      detail: verdict ? `Verdict: ${verdict}` : undefined,
    },
    {
      n: '5', title: 'Authority token issued',
      what: 'After finalization the gate receives the token. If the incident still says AUTHORITY_PENDING, press "Sync authority from gate".',
      link: { to: `/incident/${run.incidentId}`, label: 'Open incident' },
      done: !!tokenState,
      detail: tokenState ? `Token state: ${tokenState}` : (verdict && verdict !== 'CONFIRMED' ? 'The validators did not confirm; no token. Send us the incident page.' : undefined),
    },
    {
      n: '6', title: 'Execute the token',
      what: 'Open the token page and press Execute. Wait for finalized and verified; the target is then suspended for 5 minutes.',
      link: inc?.token_id ? { to: `/token/${inc.token_id}`, label: 'Open token' } : undefined,
      done: tokenState === 'DISPATCHED' || tokenState === 'APPLIED' || tokenState === 'EXPIRED' || suspended,
      detail: suspended ? `Target suspended until ${new Date((target?.suspended_until ?? 0) * 1000).toLocaleTimeString()}` : undefined,
    },
    {
      n: '7', title: 'Guarded operation is rejected while suspended',
      what: 'On the Vault page record signal "blocked-1". Expected: rejected on-chain, Rejected Attempts goes up. Do this before the suspension ends.',
      link: { to: '/target', label: 'Open guarded target' },
      done: !!target && target.rejected_count > 0,
      detail: target ? `Rejected attempts so far: ${target.rejected_count}` : undefined,
    },
    {
      n: '8', title: 'Functionality restored after expiry',
      what: suspended ? 'Wait until the suspension ends, then record signal "restored-1".' : 'Record signal "restored-1". Expected: recorded.',
      link: { to: '/target', label: 'Open guarded target' },
      done: !!target && target.signal_count > 0 && !suspended,
      detail: target ? `Signals recorded: ${target.signal_count}` : undefined,
    },
    {
      n: '9', title: 'Settle token and incident',
      what: 'Press Sync on the token page, then "Sync authority from gate" on the incident page.',
      link: inc?.token_id ? { to: `/token/${inc.token_id}`, label: 'Open token' } : undefined,
      done: tokenState === 'APPLIED' && inc?.status === 'SUSPENSION_APPLIED',
      detail: inc ? `Incident: ${inc.status}` : undefined,
    },
    {
      n: '10', title: 'Optional: contradicting evidence must not confirm',
      what: 'Open an incident with scenario "Contradicting evidence" and judge it. Expected: not CONFIRMED, no token.',
      link: { to: '/incident/new', state: { policyId: run.policyId, scenario: 'contradiction' }, label: 'Open pre-filled form' },
      done: !!contraVerdict,
      detail: contraVerdict ? `Verdict: ${contraVerdict}${contraVerdict === 'CONFIRMED' ? ' (unexpected!)' : ''}` : undefined,
    },
  ] : [];

  const firstOpen = steps.findIndex(s => !s.done);
  const stateOf = (i: number, s: Step): StepState => (s.done ? 'done' : i === firstOpen ? 'next' : 'todo');

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>Test guide</p>
      <h1 className="font-ui font-bold text-3xl mb-2" style={{ color: 'var(--fg)' }}>Run the full lifecycle</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--fg-muted)' }}>
        Every step is a real StudioNet transaction with real validator consensus. Forms open pre-filled; each step
        turns green only when the chain shows the result. Evidence sources are three static demo files in this
        repository (docs/evidence/), written by the operator; this proves validators agree on what committed sources
        say, not that the sources are true.
      </p>

      <div className="card mb-6">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--fg-muted)' }}>Before you start</p>
        <p className="text-sm mb-2" style={{ color: 'var(--fg)' }}>
          Wallet: {connected ? <span className="font-mono">{address}</span> : 'not connected (use the button in the top bar)'}
        </p>
        <p className="text-sm" style={{ color: 'var(--fg)' }}>
          Guarded target governance:{' '}
          <a className="font-mono" style={{ color: 'var(--accent)' }} href={explorerAddr(TARGET_ADDRESS)} target="_blank" rel="noreferrer">{gov || '…'}</a>
        </p>
        <p className="text-sm mt-2" style={{ color: isGov ? 'var(--success)' : 'var(--warn)' }}>
          {isGov
            ? 'This wallet is the target\'s governance address: you can run every step.'
            : 'This wallet is not the target\'s governance address. Steps 1–6 and 9 (publish, open, judge, execute) can only be run by that address, so you cannot drive them with this wallet. Step 7 and 8 (the guarded operation) work with any wallet while the target is suspended. To run the whole lifecycle yourself, deploy your own GuardedTarget(gate address) and point config.ts at it.'}
        </p>
      </div>

      {!run ? (
        <button className="btn btn-primary notched-sm" onClick={start}>Start a test run</button>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>Run {run.suffix}</span>
            <button className="btn btn-ghost notched-sm text-xs" onClick={() => { void refresh(); }}>Refresh</button>
            <button className="btn btn-ghost notched-sm text-xs" onClick={reset}>Start over</button>
          </div>

          <ol className="flex flex-col gap-3 mb-8">
            {steps.map((s, i) => {
              const st = stateOf(i, s);
              const color = st === 'done' ? 'var(--success)' : st === 'next' ? 'var(--accent)' : 'var(--fg-subtle)';
              return (
                <li key={s.n} className="card" style={{ borderColor: color }}>
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-sm font-bold" style={{ color }}>{st === 'done' ? '✓' : s.n}</span>
                    <div className="flex-1">
                      <p className="font-ui font-bold text-sm" style={{ color: 'var(--fg)' }}>{s.title}</p>
                      <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>{s.what}</p>
                      {s.detail && <p className="font-mono text-xs mt-1" style={{ color }}>{s.detail}</p>}
                      {s.link && st !== 'done' && (
                        <Link to={s.link.to} state={s.link.state}
                          className="btn btn-outline-accent notched-sm text-xs inline-block mt-3">{s.link.label}</Link>
                      )}
                      {s.link && st === 'done' && (
                        <Link to={s.link.to} state={s.link.state} className="text-xs mt-2 inline-block" style={{ color: 'var(--accent)' }}>View</Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="font-ui text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--fg-muted)' }}>Transaction log (this browser)</p>
              <button className="btn btn-ghost notched-sm text-xs" onClick={() => { void copyLog(); }} disabled={log.length === 0}>
                {copied ? 'Copied' : 'Copy log'}
              </button>
            </div>
            {log.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Confirmed transactions appear here as you go. Copy the log and send it with your results.</p>
            ) : (
              <pre className="font-mono text-xs" style={{ color: 'var(--fg-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{txLogText(log)}</pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
