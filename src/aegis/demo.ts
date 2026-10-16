// Guided test support: demo values, the current test run's IDs, and a log of confirmed transactions.
// Everything here is read/written in this browser only (localStorage); nothing is sent anywhere.
import { EXPLORER } from './config';

const REPO_RAW = 'https://raw.githubusercontent.com/Siriron/aegis-app/main/docs/evidence';
export const FEED = {
  a: `${REPO_RAW}/feed-a.md`,
  b: `${REPO_RAW}/feed-b.md`,
  clear: `${REPO_RAW}/feed-clear.md`,
};

export const DEMO_HOSTS = 'raw.githubusercontent.com';
export const DEMO_TRIGGER =
  'Suspend the guarded operation only when at least one approved source reports an active, confirmed exploit of the guarded operation and no approved source credibly denies it.';
export const DEMO_SOURCE_RULES =
  'Only the approved raw.githubusercontent.com evidence files count. A source that cannot be fetched is unavailable evidence, never support.';

export interface Scenario {
  key: string;
  label: string;
  rationale: string;
  urls: string[];
  expected: string;
}

export const SCENARIOS: Scenario[] = [
  {
    key: 'confirmed',
    label: 'Confirmed exploit (feed A + feed B agree)',
    rationale: 'Two approved evidence feeds report a confirmed, ongoing exploit of the guarded operation, so a temporary suspension is requested.',
    urls: [FEED.a, FEED.b],
    expected: 'CONFIRMED, then a token is issued',
  },
  {
    key: 'contradiction',
    label: 'Contradicting evidence (feed A says exploit, feed C says all clear)',
    rationale: 'Requesting suspension even though one approved feed reports all clear, so this must not be confirmed.',
    urls: [FEED.a, FEED.clear],
    expected: 'Not CONFIRMED (CONFLICTING), no token',
  },
  {
    key: 'single',
    label: 'Single source (feed A only)',
    rationale: 'One approved evidence feed reports a confirmed, ongoing exploit of the guarded operation and a temporary suspension is requested.',
    urls: [FEED.a],
    expected: 'CONFIRMED or WEAK_EVIDENCE depending on the validators',
  },
];

// ---- current test run -------------------------------------------------------------------------

export interface Run {
  suffix: string;
  policyId: string;
  protocolId: string;
  incidentId: string;
  contraIncidentId: string;
}

const RUN_KEY = 'aegis.run';
const LOG_KEY = 'aegis.txlog';

function load<T>(key: string): T | null {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable: guide still works per page */ }
}

export function getRun(): Run | null {
  return load<Run>(RUN_KEY);
}

// One protocol ID per wallet: the first publisher owns a protocol ID, so a shared ID would lock others out.
export function newRun(address: string | null): Run {
  const suffix = Date.now().toString(36);
  const owner = (address ?? '0000000000').replace(/^0x/i, '').slice(0, 6).toLowerCase();
  const run: Run = {
    suffix,
    policyId: `pol-demo-${suffix}`,
    protocolId: `aegis-demo-${owner}`,
    incidentId: `inc-demo-${suffix}`,
    contraIncidentId: `inc-contra-${suffix}`,
  };
  save(RUN_KEY, run);
  return run;
}

// Re-open an earlier run by its suffix (the IDs are derived from it), e.g. after the browser forgot it.
export function resumeRun(suffix: string, address: string | null): Run | null {
  const clean = suffix.trim().toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(clean)) return null;
  const owner = (address ?? '0000000000').replace(/^0x/i, '').slice(0, 6).toLowerCase();
  const run: Run = {
    suffix: clean,
    policyId: `pol-demo-${clean}`,
    protocolId: `aegis-demo-${owner}`,
    incidentId: `inc-demo-${clean}`,
    contraIncidentId: `inc-contra-${clean}`,
  };
  save(RUN_KEY, run);
  return run;
}

export function clearRun() {
  try { localStorage.removeItem(RUN_KEY); localStorage.removeItem(LOG_KEY); } catch { /* ignore */ }
}

// ---- transaction log --------------------------------------------------------------------------

export interface LoggedTx {
  label: string;
  hash: string;
  finalized: boolean;
  at: number;
}

export function readTxLog(): LoggedTx[] {
  return load<LoggedTx[]>(LOG_KEY) ?? [];
}

export function recordTx(label: string, hash: string, finalized: boolean) {
  const log = readTxLog();
  const existing = log.find(t => t.hash === hash);
  if (existing) { existing.finalized = existing.finalized || finalized; }
  else log.push({ label, hash, finalized, at: Math.floor(Date.now() / 1000) });
  save(LOG_KEY, log);
}

export function txLogText(log: LoggedTx[]): string {
  return log
    .map(t => `${t.label} | ${t.finalized ? 'FINALIZED' : 'ACCEPTED'} | ${t.hash} | ${EXPLORER}/tx/${t.hash}`)
    .join('\n');
}
