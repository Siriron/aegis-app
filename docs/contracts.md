# Aegis — Contract API Reference

## PolicyVault

**Purpose:** Immutable policy registry. No constructor arguments.

---

### `publish_policy` (write)

Publishes a new, immutable policy definition.

| Parameter | Type | Constraints |
|---|---|---|
| `policy_id` | str | Unique slug `[A-Za-z0-9._:-]{4,96}` |
| `protocol_id` | str | Slug; first publisher claims ownership |
| `protocol_name` | str | 2–120 characters |
| `guarded_target` | str | Address of the GuardedTarget contract |
| `trigger_rules` | str | 80–5000 characters; natural-language trigger condition |
| `source_rules` | str | 40–3000 characters; source weighting rules |
| `allowed_sources_csv` | str | Comma-separated hostnames, 1–8 entries |
| `max_suspend_minutes` | int | 5–1440 |
| `authority_ttl_minutes` | int | 5–120 |
| `activation_delay_minutes` | int | 1–10080 |

**Returns:** `policy_id` (str)

**Errors:**
- `policy_id already taken`
- `only the protocol owner may add policy versions`
- `protocol_name must be 2–120 characters`
- `trigger_rules must be 80–5000 characters`
- `source_rules must be 40–3000 characters`
- `max_suspend_minutes must be 5–1440`
- `authority_ttl_minutes must be 5–120`
- `activation_delay_minutes must be 1–10080`
- `allowed_sources_csv must list 1–8 hosts`
- `invalid source host`

---

### `activate_policy` (write)

Activates a published policy as the current active version for its protocol.

| Parameter | Type | Notes |
|---|---|---|
| `policy_id` | str | Must be a published policy owned by caller |

**Returns:** `policy_id` (str)

**Errors:**
- `policy not found`
- `only the policy owner may activate`
- `activation delay has not elapsed yet`
- `cannot activate an older policy version`

---

### `get_policy` (view)

Returns the full policy JSON string for a given `policy_id`. Returns `""` if not found.

---

### `get_active_policy_id` (view)

Returns the currently active `policy_id` for a `protocol_id`. Returns `""` if none.

---

### `is_active` (view)

Returns `bool` — whether `policy_id` is the currently active policy for its protocol.

---

### `get_protocol_owner` (view)

Returns the owner address string for a `protocol_id`. Returns `""` if unclaimed.

---

### `list_policy_ids` (view)

Returns the ordered list of all published `policy_id` strings.

---

## JudgmentEngine

**Purpose:** Nondeterministic evidence evaluator.

**Constructor:** `vault_address: str, gate_address: str`

---

### `open_incident` (write)

Registers a new incident and freezes all judgment parameters.

| Parameter | Type | Constraints |
|---|---|---|
| `incident_id` | str | Unique slug `[A-Za-z0-9._:-]{4,96}` |
| `policy_id` | str | Must be the active policy for its protocol |
| `action_class` | str | Must be `"SUSPEND_GUARDED_OPERATION"` |
| `duration_minutes` | int | 1 – `policy.max_suspend_minutes` |
| `rationale` | str | 30–2400 characters |
| `source_urls_json` | str | JSON array of 1–4 canonical `https://` URLs |

**Returns:** `incident_id` (str)

**Errors:**
- `incident_id already exists`
- `policy not found in PolicyVault`
- `policy is not currently active for this protocol`
- `only the policy owner may open an incident`
- `unsupported action class`
- `duration_minutes exceeds policy limit`
- `rationale must be 30–2400 characters`
- `source_urls_json must be a JSON array of 1–4 URLs`
- `URL host not in policy allowed sources: <url>`
- `duplicate source URL`
- `source URLs must be canonical https:// URLs`

---

### `judge_incident` (write, nondeterministic)

Runs the validator consensus round and records the verdict.

| Parameter | Type | Notes |
|---|---|---|
| `incident_id` | str | Must exist, not expired, not yet conclusive |

**Returns:** verdict dict (see below)

**Verdict structure:**
```json
{
  "verdict": "CONFIRMED | NOT_CONFIRMED | WEAK_EVIDENCE | CONFLICTING | DISPROPORTIONATE",
  "rationale": "string",
  "matched_rules": ["string"],
  "key_findings": ["string"],
  "source_states": [
    {
      "url": "string",
      "state": "SUPPORTS | CONTRADICTS | NEUTRAL | UNAVAILABLE",
      "finding": "string",
      "http_status": 200,
      "content_digest": "sha256hex"
    }
  ],
  "judged_at": 1234567890,
  "policy_hash": "sha256hex",
  "op_digest": "sha256hex",
  "provenance_digest": "sha256hex"
}
```

**Errors:**
- `incident not found`
- `only the incident opener may request judgment`
- `incident has expired`
- `judgment retry limit reached`
- `incident already has a conclusive verdict`
- `policy hash mismatch — policy was mutated`

---

### `sync_authority` (write)

Anyone may call. Mirrors the gate's token state into the incident: `AUTHORITY_ISSUED`, `SUSPENSION_APPLIED` or `AUTHORITY_EXPIRED`. When the token never appeared and all retries are spent it closes the incident as `AUTHORITY_FAILED`.

### `retry_authority` (write)

Opener only. Re-sends the finalized `issue_token` emission of a `CONFIRMED` incident whose token is absent from the gate, at least 10 minutes after the last emission, at most 3 times. The token id is fixed, so a duplicate that lands later is rejected by the gate.

---

### `get_incident` (view)

Returns the full incident JSON string for an `incident_id`. Returns `""` if not found.

---

### `list_incident_ids` (view)

Returns the ordered list of all `incident_id` strings.

---

## AuthorityGate

**Purpose:** Single-use authority token gate.

**Constructor:** no arguments. Deployer is recorded at init.

---

### `bind_engine` (write)

One-time binding of the JudgmentEngine address. Only the deployer may call this, and only once.

| Parameter | Type |
|---|---|
| `engine_address` | str |

**Returns:** engine address (str)

**Errors:**
- `only deployer may bind the engine`
- `engine already bound — cannot rebind`

---

### `issue_token` (write)

Called only by the bound JudgmentEngine via finalized emission.

| Parameter | Type | Constraints |
|---|---|---|
| `token_id` | str | Unique |
| `incident_id` | str | |
| `holder` | str | Address |
| `target` | str | Address |
| `action_class` | str | `"SUSPEND_GUARDED_OPERATION"` |
| `duration_minutes` | int | 1–1440 |
| `op_digest` | str | SHA-256 hex |
| `policy_hash` | str | SHA-256 hex |
| `judgment_digest` | str | SHA-256 hex |
| `ttl_seconds` | int | 60–7200 |

**Returns:** `token_id` (str)

---

### `execute_token` (write)

Executes a confirmed authority token. Caller must be the token holder.

| Parameter | Type | Notes |
|---|---|---|
| `token_id` | str | Must exist, ISSUED, not expired |
| `target` | str | Must match token.target |
| `action_class` | str | Must match token.action_class |
| `duration_minutes` | int | Must match token.duration_minutes |

**Returns:** action_class (str)

**Recovery (lost or failed finalized child call):** a `DISPATCHED` token can be executed again with the same arguments after 120 s, at most 3 dispatches in total and never after expiry. If the target already holds the digest the token is recorded `APPLIED` and nothing is re-sent. The target applies each `token_id` once, so a re-send can never suspend twice.

**Errors:**
- `token not found`
- `dispatched recently` / `dispatch limit reached`
- `only the designated holder may execute`
- `token already applied`
- `token has expired`
- `target address mismatch`
- `action class mismatch`
- `duration mismatch`
- `operation digest mismatch — envelope tampered`

---

### `sync_token` (write)

Re-checks whether the guarded target has applied the token. Updates state to APPLIED if confirmed. Only the holder may call.

---

### `settle_token` (write)

Anyone may call. Records `APPLIED` if the target already holds the token's op digest, or the terminal `EXPIRED` if the token ran out unapplied. A dispatched token therefore cannot stay unresolved past its expiry.

---

### `get_token` (view)

Returns the full token JSON string. Lazily reflects APPLIED state from the target if currently DISPATCHED.

---

### `list_token_ids` (view)

Returns all token IDs in order of issuance.

---

### `get_engine_address` (view)

Returns the bound engine address, or `""` if not yet bound.

---

## GuardedTarget

**Purpose:** Demo contract with a real guarded operation.

**Constructor:** `gate_address: str`

---

### `record_signal` (write)

The guarded operation. Records a unique signal key. While a suspension is active the call **succeeds but rejects the operation**: it returns `0`, leaves `signal_count` unchanged, increments `rejected_count` and stores `last_rejection_json` (key, caller, time, `suspended_until`). The rejection is therefore a committed, finalizable on-chain fact, not a revert.

| Parameter | Type | Constraints |
|---|---|---|
| `signal_key` | str | 1–128 characters, unique, direct EOA call only |

**Returns:** the signal's 1-based sequence number, or `0` when rejected during a suspension

**Errors:**
- `guarded operations require a direct EOA call`
- `invalid signal_key`
- `signal already recorded`

---

### `apply_emergency_suspension` (write)

Called only by the bound AuthorityGate via finalized emission.

| Parameter | Type |
|---|---|
| `duration_minutes` | int |
| `incident_id` | str |
| `token_id` | str |
| `op_digest` | str |
| `holder` | str |

**Returns:** `suspended_until` timestamp (int)

**Errors:**
- `only the AuthorityGate may call emergency methods`
- `holder is not the governance address for this target`
- `invalid suspension duration`

Idempotent: if the same `token_id` + `op_digest` is re-submitted, returns the existing `suspended_until` without error.

---

### `get_status` (view)

Returns JSON:
```json
{
  "gate_address": "0x...",
  "governance_address": "0x...",
  "signal_count": "42",
  "suspended": true,
  "suspended_until": 1234567890,
  "last_signal_json": "{...}",
  "suspension_count": 1
}
```

---

### `get_signal` (view)

Returns the signal record JSON for a `signal_key`, or `""` if not found.

---

### `list_signal_keys` (view)

Returns all signal keys in order of recording.

---

### `list_suspension_history` (view)

Returns all suspension records as JSON strings, in order of application.

---

### `get_applied_op_digest` (view)

Returns the op_digest stored for a `token_id`, or `""` if not applied.

---

### `get_governance_address` (view)

Returns the governance address (deployer). Used by JudgmentEngine for ownership verification.

---

### `is_governance_holder` (view)

Returns `bool` — whether a given address matches the governance address.

---

### `get_signal_count` (view)

Returns `signal_count` as u256.
