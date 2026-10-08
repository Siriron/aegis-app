import { Link } from 'react-router-dom';
import { IS_DEPLOYED } from '../aegis/config';

const STEPS = [
  { icon: '⬡', label: 'Publish Charter', desc: 'Freeze trigger policy, evidence hosts, and allowed actions before any crisis.' },
  { icon: '⬡', label: 'Activate', desc: 'After the activation delay elapses, make the charter live for future incidents.' },
  { icon: '⬡', label: 'Freeze Incident', desc: 'Operator locks exact action, duration, and approved evidence URLs on-chain.' },
  { icon: '⬡', label: 'Validators Assess', desc: 'GenLayer validators independently fetch evidence and reach consensus.' },
  { icon: '⬡', label: 'Capability Issued', desc: 'Only TRIGGER_CONFIRMED on finalized transaction emits a one-shot capability.' },
  { icon: '⬡', label: 'Execute', desc: 'Holder executes the exact bound action. Vault pauses. Expires on-chain.' },
];

const OUTCOMES = [
  { label: 'TRIGGER_CONFIRMED',       color: 'var(--success)',  desc: 'Charter trigger materially supported by fetched evidence.' },
  { label: 'TRIGGER_NOT_CONFIRMED',   color: 'var(--danger)',   desc: 'Evidence fails to establish the trigger.' },
  { label: 'INSUFFICIENT_EVIDENCE',   color: 'var(--warn)',     desc: 'Sources too weak, unavailable, or incomplete.' },
  { label: 'ACTION_DISPROPORTIONATE', color: 'var(--danger)',   desc: 'Emergency confirmed but action exceeds charter scope.' },
  { label: 'CONFLICTING_EVIDENCE',    color: 'var(--warn)',     desc: 'Approved sources materially conflict.' },
];

export function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="hero-gradient scanlines relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-20 relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <span className="badge badge-cyan font-mono">GenLayer StudioNet</span>
            {IS_DEPLOYED
              ? <span className="badge badge-green">Contracts Live</span>
              : <span className="badge badge-amber">Deploy Pending</span>}
          </div>

          <h1 className="font-ui font-bold leading-none mb-4"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: 'var(--fg)' }}>
            Emergency authority
            <br />
            <span className="glow-heading" style={{ color: 'var(--accent)' }}>
              that cannot self-certify.
            </span>
          </h1>

          <p className="text-lg mb-8 max-w-2xl" style={{ color: 'var(--fg-muted)' }}>
            AEGIS is a GenLayer-native emergency-control system. A protocol commits its charter
            before any crisis. Validators independently fetch and interpret evidence.
            A capability is issued only after the assessment reaches FINALIZED.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link to="/command" className="btn btn-primary notched">
              View Command →
            </Link>
            <Link to="/policy/new" className="btn btn-outline-accent notched">
              Publish Charter
            </Link>
          </div>
        </div>

        {/* Decorative hex grid */}
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none select-none"
          style={{ fontSize: '8rem', lineHeight: 1, letterSpacing: '-0.5rem', color: 'var(--accent)' }}>
          {'⬡⬡⬡\n⬡⬡⬡\n⬡⬡⬡'}
        </div>
      </section>

      {/* Authority lifecycle */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-8"
          style={{ color: 'var(--fg-subtle)' }}>Authority Lifecycle</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {STEPS.map((s, i) => (
            <div key={i} className="card notched relative">
              <div className="font-ui text-2xl mb-2" style={{ color: 'var(--accent)' }}>{s.icon}</div>
              <div className="font-ui font-bold text-xs uppercase tracking-wider mb-1"
                style={{ color: 'var(--fg)' }}>{s.label}</div>
              <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>{s.desc}</div>
              <div className="absolute top-2 right-3 font-mono text-xs"
                style={{ color: 'var(--fg-subtle)' }}>{String(i + 1).padStart(2, '0')}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Validator outcomes */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-6"
          style={{ color: 'var(--fg-subtle)' }}>Validator Outcomes</p>
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Meaning</th>
                <th>Capability issued?</th>
              </tr>
            </thead>
            <tbody>
              {OUTCOMES.map(o => (
                <tr key={o.label}>
                  <td>
                    <span className="font-mono text-xs font-bold" style={{ color: o.color }}>{o.label}</span>
                  </td>
                  <td className="text-sm" style={{ color: 'var(--fg-muted)' }}>{o.desc}</td>
                  <td>
                    {o.label === 'TRIGGER_CONFIRMED'
                      ? <span className="badge badge-green">Yes — on FINALIZED</span>
                      : <span className="badge badge-gray">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Safety callout */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="card-accent notched">
          <p className="font-ui text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--accent)' }}>Important Boundary</p>
          <p style={{ color: 'var(--fg-muted)' }} className="text-sm leading-relaxed">
            AEGIS does <strong style={{ color: 'var(--fg)' }}>not</strong> claim GenLayer proves a protocol
            is legally entitled to act, nor that web sources are universally true. The bounded question is:
            given this protocol's pre-committed charter and these frozen approved evidence sources,
            does the charter authorize this exact emergency action now?
            <strong style={{ color: 'var(--accent)' }}> Uncertainty fails closed.</strong>
          </p>
        </div>
      </section>
    </div>
  );
}
