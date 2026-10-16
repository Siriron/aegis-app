// ── Aegis network + contract config ──────────────────────────────────────

export const CHAIN_ID     = 61999;
export const CHAIN_ID_HEX = '0xF22F';
export const RPC_URL      = 'https://studio.genlayer.com/api';
export const EXPLORER     = 'https://explorer-studio.genlayer.com';
export const NETWORK_NAME = 'GenLayer StudioNet';
export const CURRENCY     = 'GEN';

// Deployed contract addresses (StudioNet)
export const VAULT_ADDRESS   : string = '0x2f2E2064994715bfDb5F399b968E77C7759c2148'; // PolicyVault
export const ENGINE_ADDRESS  : string = '0x92F5e5617EDADD456B54893CD0fe122D3FE2c0E0'; // JudgmentEngine
export const GATE_ADDRESS    : string = '0xb4032127b0E33916e1Fd4B2B6C9f397cBA622e57'; // AuthorityGate
export const TARGET_ADDRESS  : string = '0x8100713b0C76E04De7E8CAE7a410dCd824b29Cf1'; // GuardedTarget

export const ZERO_ADDRESS: string = '0x0000000000000000000000000000000000000000';

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
