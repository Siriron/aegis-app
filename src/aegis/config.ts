// ── Aegis network + contract config ──────────────────────────────────────

export const CHAIN_ID     = 61999;
export const CHAIN_ID_HEX = '0xF22F';
export const RPC_URL      = 'https://studio.genlayer.com/api';
export const EXPLORER     = 'https://explorer-studio.genlayer.com';
export const NETWORK_NAME = 'GenLayer StudioNet';
export const CURRENCY     = 'GEN';

// Deployed contract addresses — fill in after deploying all four contracts
export const VAULT_ADDRESS   = '0x0000000000000000000000000000000000000000'; // PolicyVault
export const ENGINE_ADDRESS  = '0x0000000000000000000000000000000000000000'; // JudgmentEngine
export const GATE_ADDRESS    = '0x0000000000000000000000000000000000000000'; // AuthorityGate
export const TARGET_ADDRESS  = '0x0000000000000000000000000000000000000000'; // GuardedTarget

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const IS_DEPLOYED =
  VAULT_ADDRESS  !== ZERO_ADDRESS &&
  ENGINE_ADDRESS !== ZERO_ADDRESS &&
  GATE_ADDRESS   !== ZERO_ADDRESS &&
  TARGET_ADDRESS !== ZERO_ADDRESS;

export function explorerTx(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}
export function explorerAddr(addr: string): string {
  return `${EXPLORER}/address/${addr}`;
}
