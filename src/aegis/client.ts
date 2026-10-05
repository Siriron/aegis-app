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

async function walletSend(to: string, method: string, args: unknown[]): Promise<string> {
  const client = await writeClient();
  const hash = await client.writeContract({
    address: to as Hex,
    functionName: method,
    args: args.map(a => (typeof a === 'number' ? BigInt(a) : a)) as never,
    value: BigInt(0),
  });
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

export async function waitForReceipt(hash: string, timeoutMs = 480_000): Promise<void> {
  const interval = 4000;
  try {
    await readClient.waitForTransactionReceipt({
      hash: hash as never,
      status: TransactionStatus.ACCEPTED,
      retries: Math.max(1, Math.ceil(timeoutMs / interval)),
      interval,
    });
  } catch {
    throw new TimeoutError(hash);
  }
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
