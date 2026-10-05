import { explorerTx } from '../aegis/config';

interface Props {
  hash: string | null;
  error: string | null;
  waiting: boolean;
  label?: string;
}

export function TxStatus({ hash, error, waiting, label = 'Transaction' }: Props) {
  if (waiting) {
    return (
      <div className="card flex items-center gap-3 mt-4">
        <span className="spinner" />
        <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>
          Waiting for consensus — this takes 20–120 seconds…
        </span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="card-danger mt-4">
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: 'var(--danger)' }}>Error</p>
        <p className="text-sm font-mono" style={{ color: 'var(--fg)' }}>{error}</p>
      </div>
    );
  }
  if (hash) {
    return (
      <div className="card mt-4" style={{ borderColor: 'var(--success)' }}>
        <p className="font-ui text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: 'var(--success)' }}>{label} submitted</p>
        <a href={explorerTx(hash)} target="_blank" rel="noreferrer"
          className="font-mono text-xs break-all"
          style={{ color: 'var(--accent)' }}>{hash}</a>
      </div>
    );
  }
  return null;
}
