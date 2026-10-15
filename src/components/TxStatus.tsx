import { useState } from 'react';
import { explorerTx } from '../aegis/config';
import { isFinalized } from '../aegis/client';
import type { TxPhase, TxResult } from '../aegis/client';

interface Props {
  hash: string | null;
  error: string | null;
  waiting: boolean;
  label?: string;
  phase?: TxPhase | null;
  result?: TxResult | null;
}

const PHASE_TEXT: Record<TxPhase, string> = {
  consensus: 'Waiting for validator consensus (ACCEPTED) — this takes 20–120 seconds…',
  finalizing: 'Accepted and executed. Waiting for FINALIZED — the result is provisional and appealable until then…',
  verifying: 'Reading the contract state to confirm the change actually happened…',
};

export function TxStatus({ hash, error, waiting, label = 'Transaction', phase, result }: Props) {
  const [recheck, setRecheck] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (waiting) {
    return (
      <div className="card mt-4">
        <div className="flex items-center gap-3">
          <span className="spinner" />
          <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            {phase ? PHASE_TEXT[phase] : PHASE_TEXT.consensus}
          </span>
        </div>
        {hash && (
          <a href={explorerTx(hash)} target="_blank" rel="noreferrer"
            className="font-mono text-xs break-all block mt-2" style={{ color: 'var(--accent)' }}>{hash}</a>
        )}
      </div>
    );
  }
  if (error) {
    const pending = !!hash && error.includes('not finalized yet');
    async function check() {
      if (!hash) return;
      setChecking(true);
      try {
        setRecheck((await isFinalized(hash)) ? 'Finalized.' : 'Not finalized yet — still provisional and appealable.');
      } catch {
        setRecheck('Could not read the transaction. Try again shortly.');
      } finally {
        setChecking(false);
      }
    }
    return (
      <div className="card-danger mt-4">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: 'var(--danger)' }}>{pending ? 'Provisional' : 'Not confirmed'}</p>
        <p className="text-sm font-mono" style={{ color: 'var(--fg)' }}>{error}</p>
        {pending && (
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-ghost notched-sm text-xs" onClick={() => { void check(); }} disabled={checking}>
              {checking ? 'Checking…' : 'Re-check finality'}
            </button>
            {recheck && <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{recheck}</span>}
          </div>
        )}
      </div>
    );
  }
  if (hash && result) {
    return (
      <div className="card mt-4" style={{ borderColor: result.finalized ? 'var(--success)' : 'var(--warn)' }}>
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: result.finalized ? 'var(--success)' : 'var(--warn)' }}>
          {label}: {result.finalized ? 'finalized and verified' : 'executed and verified — provisional, appealable until finalized'}
        </p>
        <a href={explorerTx(hash)} target="_blank" rel="noreferrer"
          className="font-mono text-xs break-all"
          style={{ color: 'var(--accent)' }}>{hash}</a>
      </div>
    );
  }
  return null;
}
