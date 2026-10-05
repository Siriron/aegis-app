// ── Aegis TypeScript types ────────────────────────────────────────────────

export interface Policy {
  policy_id: string;
  protocol_id: string;
  protocol_name: string;
  owner: string;
  guarded_target: string;
  trigger_rules: string;
  source_rules: string;
  allowed_sources: string[];
  max_suspend_minutes: number;
  authority_ttl_minutes: number;
  activation_delay_minutes: number;
  published_at: number;
  ready_after: number;
  version: number;
  policy_hash: string;
}

export type IncidentStatus =
  | 'OPEN'
  | 'AUTHORITY_PENDING'
  | 'CONFIRMED_NO_GOVERNANCE'
  | 'RETRYABLE'
  | 'CLOSED_NO_AUTHORITY';

export type Verdict =
  | 'CONFIRMED'
  | 'NOT_CONFIRMED'
  | 'WEAK_EVIDENCE'
  | 'CONFLICTING'
  | 'DISPROPORTIONATE';

export type SourceState = 'SUPPORTS' | 'CONTRADICTS' | 'NEUTRAL' | 'UNAVAILABLE';

export interface SourceStateRecord {
  url: string;
  state: SourceState;
  finding: string;
  http_status: number;
  content_digest: string;
}

export interface JudgmentResult {
  verdict: Verdict;
  rationale: string;
  matched_rules: string[];
  key_findings: string[];
  source_states: SourceStateRecord[];
  judged_at: number;
  policy_hash: string;
  op_digest: string;
  provenance_digest: string;
  gov_status?: string;
  gov_note?: string;
}

export interface Incident {
  incident_id: string;
  policy_id: string;
  policy_hash: string;
  protocol_id: string;
  opener: string;
  target: string;
  action_class: string;
  duration_minutes: number;
  rationale: string;
  source_urls: string[];
  opened_at: number;
  expires_at: number;
  op_digest: string;
  status: IncidentStatus;
  verdict_json: string;
  verdict_digest: string;
  judgment_count: number;
  token_id: string;
}

export type TokenState = 'ISSUED' | 'DISPATCHED' | 'APPLIED';

export interface AuthorityToken {
  token_id: string;
  incident_id: string;
  holder: string;
  target: string;
  action_class: string;
  duration_minutes: number;
  op_digest: string;
  policy_hash: string;
  judgment_digest: string;
  issued_at: number;
  expires_at: number;
  state: TokenState;
  dispatched_at: number;
  applied_at: number;
}

export interface TargetStatus {
  gate_address: string;
  governance_address: string;
  signal_count: number;
  suspended_until: number;
  last_signal_json: string;
  suspension_count: number;
}

export interface WalletState {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
}
