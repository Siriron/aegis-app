// ── Aegis network + contract config ──────────────────────────────────────

export const CHAIN_ID     = 61999;
export const CHAIN_ID_HEX = '0xF22F';
export const RPC_URL      = 'https://studio.genlayer.com/api';
export const EXPLORER     = 'https://explorer-studio.genlayer.com';
export const NETWORK_NAME = 'GenLayer StudioNet';
export const CURRENCY     = 'GEN';

// Deployed contract addresses (StudioNet)
export const VAULT_ADDRESS   : string = '0x711c5Abc26CD35fe89be962fDdBc210E59f3D636'; // PolicyVault
export const ENGINE_ADDRESS  : string = '0x7e50078AfB31E880406197E64910Ec2dbFf6BC30'; // JudgmentEngine
export const GATE_ADDRESS    : string = '0x88CFE8751b76064c9FC28B90fDe93815Ea966166'; // AuthorityGate
export const TARGET_ADDRESS  : string = '0x2c4307C13E909a232acF1DbEeD4Cd4ac0A98b953'; // GuardedTarget

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
