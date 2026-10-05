<div align="center">

<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
  <rect width="96" height="96" rx="20" fill="#0f1117"/>
  <polygon points="48,12 72,30 72,54 48,84 24,54 24,30" fill="none" stroke="#00ffe0" stroke-width="2.5" stroke-linejoin="round"/>
  <polygon points="48,24 62,34 62,52 48,68 34,52 34,34" fill="none" stroke="#7c5cfc" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="48" cy="48" r="6" fill="#00ffe0"/>
  <line x1="48" y1="24" x2="48" y2="42" stroke="#00ffe0" stroke-width="1.5"/>
  <line x1="62" y1="34" x2="54" y2="42" stroke="#00ffe0" stroke-width="1.5"/>
  <line x1="62" y1="52" x2="54" y2="54" stroke="#00ffe0" stroke-width="1.5"/>
</svg>

# Aegis Protocol

**Onchain emergency-authority governance · GenLayer StudioNet**

[![GenLayer](https://img.shields.io/badge/GenLayer-StudioNet-00ffe0?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNyIgc3Ryb2tlPSIjMDBmZmUwIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=&labelColor=0f1117)](https://studio.genlayer.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-7c5cfc?style=flat-square&logo=typescript&labelColor=0f1117)](https://typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-00ffe0?style=flat-square&logo=react&labelColor=0f1117)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-f5f5f5?style=flat-square&labelColor=0f1117)](LICENSE)

---

*Protocols commit to verifiable trigger rules before an incident occurs.*  
*GenLayer validators independently fetch frozen evidence and judge whether the trigger is satisfied.*  
*No trust required — the policy, the sources, and the judgment are all onchain.*

</div>

---

## Contents

- [What Aegis Does](#what-aegis-does)
- [Architecture](#architecture)
- [Contract System](#contract-system)
- [User Flows](#user-flows)
- [Frontend](#frontend)
- [Setup](#setup)
- [Deploying the Contracts](#deploying-the-contracts)
- [Testing Transactions](#testing-transactions)
- [Project Structure](#project-structure)
- [Security Properties](#security-properties)
- [FAQ](#faq)

---

## What Aegis Does

Aegis is a four-contract onchain governance system for **emergency authority**. A protocol can publish a policy that says:

> *"If the on-chain evidence at these specific URLs demonstrates that trigger condition X is met, then address Y is authorised to suspend operation Z for at most N minutes."*

This commitment is immutable from the moment of publication. When an incident is later raised, GenLayer validators independently fetch the frozen evidence URLs, evaluate them against the frozen policy rules, and reach a consensus verdict — no oracle, no multisig, no off-chain committee.

If the verdict is **CONFIRMED**, a single-use, expiring authority token is issued to the incident opener. The opener (and only the opener) can execute that token, which triggers the guarded target contract to enter an emergency suspension state.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        Aegis Protocol                              │
│                                                                    │
│  ┌──────────────┐    read policy    ┌──────────────────────────┐  │
│  │  PolicyVault │◄──────────────────│      JudgmentEngine      │  │
│  │              │                   │  (only nondet contract)   │  │
│  │  • publish   │                   │                           │  │
│  │  • activate  │  fetch sources    │  1. open_incident         │  │
│  │  • immutable │  LLM verdict      │  2. judge_incident ────┐  │  │
│  └──────────────┘  validator agree  │                        │  │  │
│                                     └──────────────────────────┘  │
│                                              │ on finalized        │
│                                              ▼ emit                │
│  ┌──────────────┐ apply_emergency ┌──────────────────────────┐    │
│  │ GuardedTarget│◄────────────────│     AuthorityGate        │    │
│  │              │  suspension     │                           │    │
│  │  • record    │                 │  • issue_token            │    │
│  │    signal    │                 │  • execute_token          │    │
│  │  • suspended │                 │  • sync_token             │    │
│  │    state     │                 └──────────────────────────┘    │
│  └──────────────┘                                                   │
└────────────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. Protocol owner deploys all four contracts, binds the engine address in AuthorityGate.
2. Owner publishes a policy in PolicyVault (immutable once published) and activates it after the delay.
3. When an incident occurs, the owner opens an incident in JudgmentEngine, supplying frozen source URLs.
4. Owner calls `judge_incident` — validators independently fetch sources, run LLM evaluation, cross-validate, reach consensus.
5. On CONFIRMED: JudgmentEngine emits a finalized call to AuthorityGate, which mints a single-use token.
6. Owner executes the token via AuthorityGate, which emits a finalized call to GuardedTarget.
7. GuardedTarget records the suspension — the guarded operation is rejected until the suspension expires.

---

## Contract System

### PolicyVault

Stores immutable, versioned, owner-bound policy definitions. Each policy freezes:

| Field | Description |
|---|---|
| `policy_id` | Unique slug, chosen by the publisher (`[A-Za-z0-9._:-]{4,96}`) |
| `protocol_id` | Protocol family — first publisher claims ownership forever |
| `protocol_name` | Human-readable protocol name (2–120 chars) |
| `trigger_rules` | Natural-language rules the validator evaluates (80–5000 chars) |
| `source_rules` | How sources should be weighted and interpreted (40–3000 chars) |
| `allowed_sources` | 1–8 approved evidence hostnames |
| `max_suspend_minutes` | Hard ceiling on suspension duration (5–1440) |
| `authority_ttl_minutes` | How long a confirmed token stays executable (5–120) |
| `activation_delay_minutes` | Minimum wait before policy can be activated (1–10080) |
| `policy_hash` | SHA-256 of the canonical core fields — referenced in every downstream object |

**Key rules:**
- Once published, a policy cannot be edited.
- A newer version can be published and activated, replacing the current active policy.
- Only the protocol owner can add policy versions; ownership is claimed by the first publisher.

---

### JudgmentEngine

The only nondeterministic contract. Validators independently:

1. Fetch all frozen source URLs (64 KB limit per source, 256 KB total)
2. Evaluate content against the frozen policy trigger rules
3. Return a bounded verdict with per-source states
4. Agree exactly on the verdict and on every per-source state (no second LLM call)
5. Stamp HTTP status and SHA-256 content digest for auditability

**Verdicts:**

| Verdict | Meaning |
|---|---|
| `CONFIRMED` | Evidence materially satisfies the trigger — token issued |
| `NOT_CONFIRMED` | Evidence clearly fails to establish the trigger |
| `WEAK_EVIDENCE` | Sources too thin, unavailable, or incomplete — retryable |
| `CONFLICTING` | Approved sources materially disagree — retryable |
| `DISPROPORTIONATE` | Trigger exists but requested suspension is too broad |

Incidents expire after **24 hours**. Retryable verdicts allow up to **3 judgment attempts**.

---

### AuthorityGate

Receives finality-triggered authority tokens from JudgmentEngine. Each token is:

- **Single-use** — once executed, state is `APPLIED` forever
- **Expiring** — TTL is set by `authority_ttl_minutes` in the policy
- **Holder-bound** — only the incident opener may execute it
- **Digest-verified** — an operation digest ties the token to the exact incident + policy + target + action + duration

Token states: `ISSUED → DISPATCHED → APPLIED`

---

### GuardedTarget

A concrete demo target contract showing a real guarded operation:

- `record_signal(key)` — the guarded write operation; rejected while suspended
- `apply_emergency_suspension(...)` — callable only by the bound AuthorityGate
- `get_status()` — returns suspension state, signal count, governance address
- Idempotent: a repeated token execution for the same `token_id` returns without error

---

## User Flows

### Flow 1 — Publish and Activate a Policy

```
Wallet A (Protocol Owner)
  │
  ├─ 1. PolicyVault.publish_policy(...)     → policy_id returned
  │        delay: activation_delay_minutes
  ├─ 2. PolicyVault.activate_policy(...)    → policy now live
  │
  └─ Policy is now the active governance rule for the protocol.
```

### Flow 2 — Open and Judge an Incident

```
Wallet A (Policy Owner)
  │
  ├─ 3. JudgmentEngine.open_incident(...)   → incident_id returned
  │        • freezes policy_id, source_urls, action, duration
  │
  ├─ 4. JudgmentEngine.judge_incident(...)  → nondet validator round
  │        validators fetch sources, evaluate, cross-validate
  │        consensus: CONFIRMED / NOT_CONFIRMED / WEAK_EVIDENCE / ...
  │
  │   If CONFIRMED:
  ├─ 5. AuthorityGate receives token via finalized emit
  │        token: ISSUED
  │
  ├─ 6. AuthorityGate.execute_token(...)    → dispatches to GuardedTarget
  │        token: DISPATCHED → GuardedTarget enters suspension
  │
  └─ 7. GuardedTarget.record_signal() rejects calls until suspension expires.
```

### Flow 3 — Retry a Weak Verdict

```
  ├─ 4a. judge_incident returns WEAK_EVIDENCE or CONFLICTING
  │         incident.status = "RETRYABLE"
  ├─ 4b. judge_incident called again (up to 3 total attempts)
  └─ 4c. On CONFIRMED → continues to step 5.
```

---

## Frontend

Aegis ships a Vite + React + TypeScript SPA with a cyberpunk-light design system.

**Pages:**

| Route | Description |
|---|---|
| `/` | Landing page — protocol overview, live stats |
| `/command` | Command Centre — live policy and incident feed |
| `/policy/new` | Publish a new policy |
| `/policy/:id` | Policy detail — metadata, hash, active status, linked incidents |
| `/incident/new` | Open a new incident |
| `/incident/:id` | Incident detail — verdict, source states, token status, execute |
| `/token/:id` | Authority token detail — execute, sync, apply status |
| `/target` | GuardedTarget live state — signal feed, suspension status |

**Design system:**
- Light cyberpunk palette: `#0a0e1a` backgrounds with `#00ffe0` (signal teal) and `#7c5cfc` (void violet) accents
- Space Grotesk (display) · DM Sans (body) · JetBrains Mono (data)
- Notched-corner card and button primitives
- Animated scanline overlay, grid-dot background
- All status values rendered as coloured badges

---

## Setup

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/Siriron/aegis-app
cd aegis-app
npm install
npm run dev
```

App runs at `http://localhost:5173`.

**MetaMask — add GenLayer StudioNet:**

```
Network name:  GenLayer StudioNet
RPC URL:       https://studio.genlayer.com/api
Chain ID:      61999
Currency:      GEN
Explorer:      https://explorer-studio.genlayer.com
```

Get test GEN at [faucet.genlayer.com](https://faucet.genlayer.com).

---

## Deploying the Contracts

All four contracts must be deployed in order. Each takes the address of the previous one as a constructor argument.

### Step 1 — Deploy PolicyVault

No constructor arguments.

```
Contract file: contracts/PolicyVault.py
Constructor:   (none)
```

Note the deployed address: `POLICY_VAULT_ADDRESS`

---

### Step 2 — Deploy AuthorityGate

No constructor arguments.

```
Contract file: contracts/AuthorityGate.py
Constructor:   (none)
```

Note the deployed address: `AUTHORITY_GATE_ADDRESS`

---

### Step 3 — Deploy GuardedTarget

Constructor argument: the AuthorityGate address.

```
Contract file: contracts/GuardedTarget.py
Constructor:   gate_address = AUTHORITY_GATE_ADDRESS
```

Note the deployed address: `GUARDED_TARGET_ADDRESS`

---

### Step 4 — Deploy JudgmentEngine

Constructor arguments: PolicyVault address and AuthorityGate address.

```
Contract file: contracts/JudgmentEngine.py
Constructor:   vault_address = POLICY_VAULT_ADDRESS
               gate_address  = AUTHORITY_GATE_ADDRESS
```

Note the deployed address: `JUDGMENT_ENGINE_ADDRESS`

---

### Step 5 — Bind the Engine

Call `AuthorityGate.bind_engine(JUDGMENT_ENGINE_ADDRESS)` from the deployer wallet.  
This is a one-time, irreversible operation — the gate will only accept tokens from this engine.

---

### Step 6 — Update config

Open `src/aegis/config.ts` and set all five address constants:

```ts
export const POLICY_VAULT_ADDRESS    = "0x...";
export const JUDGMENT_ENGINE_ADDRESS = "0x...";
export const AUTHORITY_GATE_ADDRESS  = "0x...";
export const GUARDED_TARGET_ADDRESS  = "0x...";
```

---

## Testing Transactions

### 1 — Publish a Policy

Go to **File a Policy** in the app. Use these test values:

**Policy ID:**
```
test-protocol-v1
```
**Protocol ID:**
```
test-protocol
```
**Protocol Name:**
```
Test Protocol
```
**Trigger Rules:**
```
Trigger this policy if the linked evidence URL clearly reports a critical security vulnerability, smart contract exploit, or fund-loss event affecting the test protocol. The evidence must be a primary source report, not a secondary commentary. The event must have occurred within the last 72 hours relative to the incident timestamp.
```
**Source Rules:**
```
Accept only content from approved domains. A source SUPPORTS the trigger if it contains a first-hand technical report with a severity rating or confirmed loss figure. A source CONTRADICTS the trigger if it explicitly states the event was a false alarm or has been resolved. A source is NEUTRAL if it discusses the topic without confirming the trigger event.
```
**Allowed Sources (comma-separated):**
```
rekt.news,github.com,blog.openzeppelin.com
```
**Max Suspend Minutes:** `60`
**Authority TTL Minutes:** `30`
**Activation Delay Minutes:** `1`

Submit, approve in MetaMask, wait for consensus.

---

### 2 — Activate the Policy

After the activation delay (1 minute), go to the policy detail page and click **Activate Policy**.

---

### 3 — Open an Incident

Go to **Open an Incident**. Use these values:

**Incident ID:**
```
test-incident-001
```
**Policy ID:**
```
test-protocol-v1
```
**Action Class:** `SUSPEND_GUARDED_OPERATION`
**Duration:** `15` minutes
**Rationale:**
```
A critical reentrancy exploit was reported affecting test-protocol contracts. The linked rekt.news post confirms a live attack with confirmed fund loss. Immediate suspension is required to prevent further drain while the fix is deployed.
```
**Source URLs (one per line):**
```
https://rekt.news/leaderboard
```

---

### 4 — Judge the Incident

On the incident detail page, click **Request Judgment**. Validators fetch the source URL, evaluate the trigger rules, and return a verdict. This takes 1–4 minutes.

---

### 5 — Execute the Token (if CONFIRMED)

If the verdict is CONFIRMED, the token detail page appears. Click **Execute Authority Token** — this dispatches a finalized call to GuardedTarget.

---

### 6 — Verify on GuardedTarget

Go to **Target** in the nav. The status panel shows:
- `suspended: true`
- `suspended_until:` a future timestamp
- Suspension history entry

Try clicking **Record Signal** — it will be rejected with the suspension error.

---

## Project Structure

```
aegis-app/
├── contracts/
│   ├── PolicyVault.py        # Immutable policy registry
│   ├── JudgmentEngine.py     # Nondeterministic evidence evaluator
│   ├── AuthorityGate.py      # Single-use authority token gate
│   └── GuardedTarget.py      # Demo guarded operation target
├── src/
│   ├── aegis/
│   │   ├── types.ts           # All TypeScript types
│   │   ├── config.ts          # Contract addresses + network config
│   │   ├── client.ts          # Contract read/write methods
│   │   └── useWallet.ts       # Wallet connection hook
│   ├── components/
│   │   ├── StatusBadge.tsx    # Incident, verdict, token state badges
│   │   ├── WalletButton.tsx   # Connect/disconnect/switch button
│   │   ├── Navbar.tsx         # Navigation bar
│   │   └── TxStatus.tsx       # Transaction status panel
│   ├── pages/
│   │   ├── LandingPage.tsx
│   │   ├── CommandPage.tsx
│   │   ├── PolicyNewPage.tsx
│   │   ├── PolicyDetailPage.tsx
│   │   ├── IncidentNewPage.tsx
│   │   ├── IncidentDetailPage.tsx
│   │   ├── TokenDetailPage.tsx
│   │   └── TargetPage.tsx
│   ├── utils/format.ts        # Address, GEN, timestamp formatters
│   ├── index.css              # Design tokens + utility classes
│   └── App.tsx                # Router + page wiring
├── docs/
│   ├── architecture.md        # Detailed system design
│   ├── contracts.md           # Full contract API reference
│   └── frontend.md            # Component and hook documentation
└── README.md
```

---

## Security Properties

| Property | How it is enforced |
|---|---|
| Policy immutability | `publish_policy` stores a frozen hash; no edit method exists |
| Source integrity | URLs are canonicalised and domain-checked at incident open time |
| LLM prompt injection | All untrusted data is fenced inside `<policy>`, `<incident>`, `<sources>` blocks with explicit instructions not to follow content inside |
| Validator independence | Each validator re-fetches and re-judges on its own, then must match the leader's verdict and per-source states exactly |
| Token single-use | `issue_token` reverts on duplicate `token_id`; `execute_token` sets state to `APPLIED` atomically |
| Op-digest binding | A SHA-256 digest of `(incident_id, policy_hash, target, action_class, duration_minutes)` is verified at execution — any parameter tamper causes revert |
| Governance alignment | JudgmentEngine checks that the policy owner matches the target's `governance_address` before issuing a token |
| Re-entrancy surface | AuthorityGate uses `on="finalized"` emission — execution only proceeds after the outer call finalises |
| Expiry | Incidents expire after 24 h; tokens expire after `authority_ttl_minutes` |

---

## FAQ

**Can a policy be changed after it is published?**  
No. `publish_policy` is a write-once operation. A new version must be published with a higher version number and re-activated.

**What happens if validators disagree?**  
The verdict is `CONFLICTING` (if sources contradict each other) or `WEAK_EVIDENCE` (if evidence is insufficient). Both are retryable up to 3 attempts.

**Who can open an incident?**  
Only the policy owner (the wallet that originally published the policy). This prevents third parties from weaponising emergency authority.

**What if the token expires before it is executed?**  
`execute_token` reverts with "token has expired". The incident must be judged again (if still within the 24-hour window and retry limit).

**Can the same target be suspended multiple times?**  
Yes. Each call to `apply_emergency_suspension` extends `suspended_until` if the new expiry is later than the current one.

**Is the frontend custodial?**  
No. All transactions are signed by the user's MetaMask wallet. The frontend never holds keys.

---

<div align="center">

Built on [GenLayer](https://genlayer.com) · Vite + React + TypeScript · MIT License

</div>


## Status

Contracts pass `genvm-lint check`. The frontend typechecks and builds (`npm run build`). The contracts are **not yet deployed** and the app has not been exercised against a live deployment; there is no automated test suite in this repository yet. Nothing here has been verified under real multi-validator consensus.

Known gaps: evidence URLs are chosen by the incident operator, restricted to hosts the policy committed in advance; first publisher of a `protocol_id` owns it; a dispatched token can be re-dispatched after expiry (the target apply is idempotent).
