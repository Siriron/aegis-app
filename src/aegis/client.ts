// Aegis GenLayer client (genlayer-js; reads parse JSON strings, writes are wallet-signed)
import {
  CHAIN_ID_HEX,
  RPC_URL,
  EXPLORER,
  NETWORK_NAME,
  CURRENCY,
  explorerTx,
  VAULT_ADDRESS,
  ENGINE_ADDRESS,
  GATE_ADDRESS,
  TARGET_ADDRESS,
} from './config';
import { recordTx } from './demo';
import type { Policy, Incident, AuthorityToken, TargetStatus, JudgmentResult } from './types';

import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

// ── Wallet + client plumbing ───────────────────────────────────────────────

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
type Hex = `0x${string}`;

function getEthereum(): Eip1193 | undefined {
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}

const readClient = createClient({ chain: studionet });

async function writeClient() {
  const eth = getEthereum();
  if (!eth) throw new Error('No wallet detected — install MetaMask');
  const accounts = (await eth.request({ method: 'eth_accounts' })) as string[];
  if (!accounts.length) throw new Error('Wallet not connected');
  // account is the plain wallet address; the wallet signs, no private key in the app.
  const client = createClient({
    chain: studionet,
    account: accounts[0] as Hex,
    provider: eth as never,
  });
  const maybeConnect = (client as unknown as { connect?: (n: string) => Promise<void> }).connect;
  if (typeof maybeConnect === 'function') {
    try { await maybeConnect.call(client, 'studionet'); } catch { /* optional */ }
  }
  return client;
}

async function viewCall(to: string, method: string, args: unknown[] = []): Promise<unknown> {
  return readClient.readContract({
    address: to as Hex,
    functionName: method,
    args: args as never,
  });
}

const sentLabels = new Map<string, string>();

function contractName(addr: string): string {
  const a = addr.toLowerCase();
  if (a === VAULT_ADDRESS.toLowerCase()) return 'PolicyVault';
  if (a === ENGINE_ADDRESS.toLowerCase()) return 'JudgmentEngine';
  if (a === GATE_ADDRESS.toLowerCase()) return 'AuthorityGate';
  if (a === TARGET_ADDRESS.toLowerCase()) return 'GuardedTarget';
  return 'contract';
}

async function walletSend(to: string, method: string, args: unknown[]): Promise<string> {
  const client = await writeClient();
  const hash = await client.writeContract({
    address: to as Hex,
    functionName: method,
    args: args.map(a => (typeof a === 'number' ? BigInt(a) : a)) as never,
    value: BigInt(0),
  });
  sentLabels.set(hash as string, `${contractName(to)}.${method}`);
  return hash as string;
}

export class TimeoutError extends Error {
  txHash: string;
  isTimeout = true;
  constructor(hash: string) {
    super(`Consensus is taking longer than expected. The transaction was submitted — check it on the explorer: ${explorerTx(hash)}`);
    this.txHash = hash;
  }
}

export class TxFailedError extends Error {
  txHash: string;
  constructor(hash: string, reason: string) {
    super(`The transaction did not execute successfully: ${reason}. Details: ${explorerTx(hash)}`);
    this.txHash = hash;
  }
}

// The receipt could not be read as a success OR a failure. Never shown as success.
export class TxUnverifiedError extends Error {
  txHash: string;
  constructor(hash: string) {
    super(`Could not verify the execution result of this transaction, so it is not treated as successful. Check it on the explorer: ${explorerTx(hash)}`);
    this.txHash = hash;
  }
}

// Accepted and executed, but not yet FINALIZED: provisional and still appealable.
export class FinalizationPendingError extends Error {
  txHash: string;
  constructor(hash: string) {
    super(`Accepted and executed, but not finalized yet — the result is provisional and appealable. Re-check later: ${explorerTx(hash)}`);
    this.txHash = hash;
  }
}

// The transaction executed, but the contract state does not show the expected change.
export class StateMismatchError extends Error {
  txHash: string;
  constructor(hash: string, detail: string) {
    super(`Transaction executed, but the on-chain state does not confirm it: ${detail}. ${explorerTx(hash)}`);
    this.txHash = hash;
  }
}

type Receipt = {
  statusName?: string;
  status?: unknown;
  txExecutionResultName?: string;
  consensus_data?: { leader_receipt?: Array<{ execution_result?: string; error?: string | null; result?: string }> };
  consensusData?: { leader_receipt?: Array<{ execution_result?: string; error?: string | null; result?: string }> };
};

export interface TxInspection {
  status: string;                           // e.g. ACCEPTED, FINALIZED, UNDETERMINED
  execution: 'SUCCESS' | 'ERROR' | 'UNKNOWN';
  error: string | null;
}

// Pure reading of a receipt. ACCEPTED only means the validators agreed on a result; that result
// can itself be an execution error. Success is therefore positive: FINISHED_WITH_RETURN (or the
// leader receipt reporting SUCCESS). Anything unreadable is UNKNOWN, never success.
export function inspectTx(tx: unknown): TxInspection {
  const t = (tx ?? {}) as Receipt;
  const lr = (t.consensus_data ?? t.consensusData)?.leader_receipt?.[0];
  const status = String(t.statusName ?? t.status ?? '').toUpperCase();
  const resultName = t.txExecutionResultName;
  let execution: TxInspection['execution'] = 'UNKNOWN';
  if (resultName === 'FINISHED_WITH_RETURN' || lr?.execution_result === 'SUCCESS') execution = 'SUCCESS';
  if (resultName === 'FINISHED_WITH_ERROR' || lr?.execution_result === 'ERROR') execution = 'ERROR';
  const error = execution === 'ERROR' ? String(lr?.error || lr?.result || 'execution error').slice(0, 300) : null;
  return { status, execution, error };
}

const BAD_STATUSES = ['UNDETERMINED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT', 'CANCELED', 'CANCELLED'];

export type TxPhase = 'consensus' | 'finalizing' | 'verifying';

export interface ConfirmOptions {
  /** Wait for FINALIZED (needed whenever the call emits a finalized child message). */
  finalize?: boolean;
  /** Read the contract state; return null when it shows the expected change, else a short reason. */
  verify?: () => Promise<string | null>;
  onPhase?: (phase: TxPhase) => void;
  timeoutMs?: number;
  finalizeTimeoutMs?: number;
}

export interface TxResult {
  hash: string;
  finalized: boolean;
}

const POLL_MS = 4000;

// Own polling loop instead of the SDK's waitForTransactionReceipt: a transient RPC error (rate limit,
// transaction not indexed yet) must not abort the wait, and a transaction that already moved on to
// FINALIZED must satisfy a wait for ACCEPTED. Only the deadline ends the wait.
async function waitStatus(hash: string, status: unknown, timeoutMs: number): Promise<unknown> {
  const wantFinal = String(status).toUpperCase().includes('FINALIZED');
  const deadline = Date.now() + timeoutMs;
  let delay = POLL_MS;
  while (Date.now() < deadline) {
    try {
      const tx = await readClient.getTransaction({ hash: hash as never });
      const st = inspectTx(tx).status;
      if (BAD_STATUSES.some(b => st.includes(b))) return tx;
      if (wantFinal ? st.includes('FINALIZED') : (st.includes('ACCEPTED') || st.includes('FINALIZED'))) return tx;
      delay = POLL_MS;
    } catch {
      delay = Math.min(delay * 2, 20_000);   // back off on RPC errors / 429
    }
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error('wait deadline reached');
}

function assertExecuted(hash: string, tx: unknown): TxInspection {
  const info = inspectTx(tx);
  if (BAD_STATUSES.some(b => info.status.includes(b))) throw new TxFailedError(hash, info.status);
  if (info.execution === 'ERROR') throw new TxFailedError(hash, info.error ?? 'execution error');
  if (info.execution !== 'SUCCESS') throw new TxUnverifiedError(hash);
  return info;
}

async function verifyState(hash: string, verify: () => Promise<string | null>): Promise<void> {
  let reason: string | null = 'not read yet';
  for (let i = 0; i < 8; i++) {
    try { reason = await verify(); } catch { reason = 'state could not be read'; }
    if (reason === null) return;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  throw new StateMismatchError(hash, reason ?? 'unknown');
}

/**
 * Authoritative confirmation of a submitted transaction:
 *  1. wait for consensus (ACCEPTED) and read the execution result positively,
 *  2. optionally wait for FINALIZED,
 *  3. optionally read the contract state and require the expected change.
 * Throws a specific error for every way this can fail; resolves only on verified success.
 */
export async function confirmTx(hash: string, opts: ConfirmOptions = {}): Promise<TxResult> {
  const timeoutMs = opts.timeoutMs ?? 480_000;
  opts.onPhase?.('consensus');
  let accepted: unknown;
  try {
    accepted = await waitStatus(hash, TransactionStatus.ACCEPTED, timeoutMs);
  } catch {
    throw new TimeoutError(hash);
  }
  assertExecuted(hash, accepted);
  const label = sentLabels.get(hash) ?? 'transaction';
  recordTx(label, hash, false);

  let finalized = false;
  if (opts.finalize) {
    opts.onPhase?.('finalizing');
    try {
      const fin = await waitStatus(hash, TransactionStatus.FINALIZED, opts.finalizeTimeoutMs ?? 600_000);
      assertExecuted(hash, fin);
      finalized = true;
      recordTx(label, hash, true);
    } catch (err) {
      if (err instanceof TxFailedError || err instanceof TxUnverifiedError) throw err;
      throw new FinalizationPendingError(hash);
    }
  }

  if (opts.verify) {
    opts.onPhase?.('verifying');
    await verifyState(hash, opts.verify);
  }
  return { hash, finalized };
}

/** One-shot re-check of an earlier transaction (used by the "Re-check finality" buttons). */
export async function isFinalized(hash: string): Promise<boolean> {
  const tx = await readClient.getTransaction({ hash: hash as never });
  const info = inspectTx(tx);
  return info.status.includes('FINALIZED') && info.execution === 'SUCCESS';
}

export async function ensureChain(): Promise<void> {
  const eth = getEthereum();
  if (!eth) throw new Error('No wallet detected');
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    if (code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: NETWORK_NAME,
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: CURRENCY, symbol: CURRENCY, decimals: 18 },
          blockExplorerUrls: [EXPLORER],
        }],
      });
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } else if (code === -32002) {
      await new Promise(r => setTimeout(r, 3000));
    } else {
      throw err;
    }
  }
}

function parseList(r: unknown): string[] {
  try {
    const v = typeof r === 'string' ? JSON.parse(r) : r;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch { return []; }
}

// ── PolicyVault ────────────────────────────────────────────────────────────

export const Vault = {
  async listPolicyIds(): Promise<string[]> {
    const r = await viewCall(VAULT_ADDRESS, 'list_policy_ids', []);
    return parseList(r);
  },

  async getPolicy(policyId: string): Promise<Policy | null> {
    const r = await viewCall(VAULT_ADDRESS, 'get_policy', [policyId]);
    if (!r || r === '') return null;
    try { return JSON.parse(r as string) as Policy; } catch { return null; }
  },

  async getActivePolicyId(protocolId: string): Promise<string> {
    const r = await viewCall(VAULT_ADDRESS, 'get_active_policy_id', [protocolId]);
    return (r as string) ?? '';
  },

  async isActive(policyId: string): Promise<boolean> {
    const r = await viewCall(VAULT_ADDRESS, 'is_active', [policyId]);
    return r === true || r === 'true';
  },

  async getProtocolOwner(protocolId: string): Promise<string> {
    const r = await viewCall(VAULT_ADDRESS, 'get_protocol_owner', [protocolId]);
    return (r as string) ?? '';
  },

  async publishPolicy(args: {
    policyId: string;
    protocolId: string;
    protocolName: string;
    guardedTarget: string;
    triggerRules: string;
    sourceRules: string;
    allowedSourcesCsv: string;
    maxSuspendMinutes: number;
    authorityTtlMinutes: number;
    activationDelayMinutes: number;
  }): Promise<string> {
    await ensureChain();
    return walletSend(VAULT_ADDRESS, 'publish_policy', [
      args.policyId, args.protocolId, args.protocolName, args.guardedTarget,
      args.triggerRules, args.sourceRules, args.allowedSourcesCsv,
      args.maxSuspendMinutes, args.authorityTtlMinutes, args.activationDelayMinutes,
    ]);
  },

  async activatePolicy(policyId: string): Promise<string> {
    await ensureChain();
    return walletSend(VAULT_ADDRESS, 'activate_policy', [policyId]);
  },
};

// ── JudgmentEngine ─────────────────────────────────────────────────────────

export const Engine = {
  async listIncidentIds(): Promise<string[]> {
    const r = await viewCall(ENGINE_ADDRESS, 'list_incident_ids', []);
    return parseList(r);
  },

  async getIncident(incidentId: string): Promise<Incident | null> {
    const r = await viewCall(ENGINE_ADDRESS, 'get_incident', [incidentId]);
    if (!r || r === '') return null;
    try { return JSON.parse(r as string) as Incident; } catch { return null; }
  },

  async openIncident(args: {
    incidentId: string;
    policyId: string;
    actionClass: string;
    durationMinutes: number;
    rationale: string;
    sourceUrlsJson: string;
  }): Promise<string> {
    await ensureChain();
    return walletSend(ENGINE_ADDRESS, 'open_incident', [
      args.incidentId, args.policyId, args.actionClass,
      args.durationMinutes, args.rationale, args.sourceUrlsJson,
    ]);
  },

  async judgeIncident(incidentId: string): Promise<string> {
    await ensureChain();
    return walletSend(ENGINE_ADDRESS, 'judge_incident', [incidentId]);
  },

  async syncAuthority(incidentId: string): Promise<string> {
    await ensureChain();
    return walletSend(ENGINE_ADDRESS, 'sync_authority', [incidentId]);
  },

  async retryAuthority(incidentId: string): Promise<string> {
    await ensureChain();
    return walletSend(ENGINE_ADDRESS, 'retry_authority', [incidentId]);
  },
};

// ── AuthorityGate ──────────────────────────────────────────────────────────

export const Gate = {
  async listTokenIds(): Promise<string[]> {
    const r = await viewCall(GATE_ADDRESS, 'list_token_ids', []);
    return parseList(r);
  },

  async getToken(tokenId: string): Promise<AuthorityToken | null> {
    const r = await viewCall(GATE_ADDRESS, 'get_token', [tokenId]);
    if (!r || r === '') return null;
    try { return JSON.parse(r as string) as AuthorityToken; } catch { return null; }
  },

  async executeToken(args: {
    tokenId: string;
    target: string;
    actionClass: string;
    durationMinutes: number;
  }): Promise<string> {
    await ensureChain();
    return walletSend(GATE_ADDRESS, 'execute_token', [
      args.tokenId, args.target, args.actionClass, args.durationMinutes,
    ]);
  },

  async syncToken(tokenId: string): Promise<string> {
    await ensureChain();
    return walletSend(GATE_ADDRESS, 'sync_token', [tokenId]);
  },

  async settleToken(tokenId: string): Promise<string> {
    await ensureChain();
    return walletSend(GATE_ADDRESS, 'settle_token', [tokenId]);
  },
};

// ── GuardedTarget ──────────────────────────────────────────────────────────

export const Target = {
  async getStatus(): Promise<TargetStatus | null> {
    const r = await viewCall(TARGET_ADDRESS, 'get_status', []);
    if (!r || r === '') return null;
    try { return JSON.parse(r as string) as TargetStatus; } catch { return null; }
  },

  async listSignalKeys(): Promise<string[]> {
    const r = await viewCall(TARGET_ADDRESS, 'list_signal_keys', []);
    return parseList(r);
  },

  async listSuspensionHistory(): Promise<string[]> {
    const r = await viewCall(TARGET_ADDRESS, 'list_suspension_history', []);
    return parseList(r);
  },

  async getAppliedDigest(tokenId: string): Promise<string> {
    const r = await viewCall(TARGET_ADDRESS, 'get_applied_op_digest', [tokenId]);
    return (r as string) ?? '';
  },

  async getGovernanceAddress(): Promise<string> {
    const r = await viewCall(TARGET_ADDRESS, 'get_governance_address', []);
    return (r as string) ?? '';
  },

  async recordSignal(signalKey: string): Promise<string> {
    await ensureChain();
    return walletSend(TARGET_ADDRESS, 'record_signal', [signalKey]);
  },
};

// ── Convenience: parse stored verdict JSON ─────────────────────────────────

export function parseVerdict(incident: Incident): JudgmentResult | null {
  if (!incident.verdict_json) return null;
  try { return JSON.parse(incident.verdict_json) as JudgmentResult; } catch { return null; }
}
