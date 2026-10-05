# Aegis — Frontend Documentation

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 6 |
| Language | TypeScript 5 (strict) |
| Routing | react-router-dom v7 |
| Wallet | genlayer-js 1.x + MetaMask window.ethereum |
| Styling | Tailwind CSS v4 + custom CSS design tokens |
| Package manager | npm |

---

## Design System

### Palette

| Token | Value | Role |
|---|---|---|
| `--bg-base` | `#0a0e1a` | Page background |
| `--bg-card` | `#0f1525` | Card surfaces |
| `--bg-elevated` | `#141929` | Elevated panels |
| `--border` | `#1e2a3d` | Borders |
| `--border-accent` | `#00ffe0` | Accent borders |
| `--signal` | `#00ffe0` | Primary accent (signal teal) |
| `--void` | `#7c5cfc` | Secondary accent (void violet) |
| `--alert` | `#ff4d6d` | Error / alert |
| `--warn` | `#ffb830` | Warning / pending |
| `--safe` | `#00e5a0` | Success / confirmed |
| `--text-primary` | `#e8edf5` | Body text |
| `--text-secondary` | `#8896b3` | Muted text |
| `--text-dim` | `#4a5568` | Disabled / placeholder |

### Typography

```css
--font-display: 'Space Grotesk', sans-serif;   /* headings, labels */
--font-body:    'DM Sans', sans-serif;          /* body copy */
--font-mono:    'JetBrains Mono', monospace;    /* addresses, hashes, data */
```

### Core Utility Classes

| Class | Description |
|---|---|
| `.card` | Dark card with border and subtle gradient |
| `.card-glow` | Card with signal-teal glow on hover |
| `.btn-primary` | Filled teal button with notched corner |
| `.btn-outline` | Outlined teal button |
| `.btn-void` | Filled violet button |
| `.btn-danger` | Alert-red outlined button |
| `.badge-confirmed` | Green badge |
| `.badge-pending` | Amber badge |
| `.badge-open` | Teal badge |
| `.badge-closed` | Muted grey badge |
| `.badge-retryable` | Violet badge |
| `.badge-alert` | Red badge |
| `.notched` | Clip-path notch on bottom-right corner |
| `.notched-sm` | Smaller notch variant |
| `.mono` | JetBrains Mono font |
| `.scanline` | Scanline overlay pseudo-element |
| `.grid-dot` | Dot-grid background pattern |

---

## Module: `src/aegis/types.ts`

All application types. Key interfaces:

### `Policy`
Full policy record from PolicyVault. Includes `policy_hash`, `ready_after`, `version`, `allowed_sources[]`.

### `Incident`
Full incident record from JudgmentEngine. Includes `status: IncidentStatus`, `verdict_json`, `op_digest`, `token_id`.

### `IncidentStatus`
```ts
'OPEN' | 'AUTHORITY_PENDING' | 'CONFIRMED_NO_GOVERNANCE' | 'RETRYABLE' | 'CLOSED_NO_AUTHORITY'
```

### `Verdict`
```ts
'CONFIRMED' | 'NOT_CONFIRMED' | 'WEAK_EVIDENCE' | 'CONFLICTING' | 'DISPROPORTIONATE'
```

### `AuthorityToken`
Full token record from AuthorityGate. Includes `state: TokenState`, `op_digest`, `judgment_digest`, `expires_at`.

### `TokenState`
```ts
'ISSUED' | 'DISPATCHED' | 'APPLIED'
```

### `TargetStatus`
Live status from GuardedTarget. Includes `suspended: boolean`, `suspended_until: number`, `signal_count: string`.

### `WalletState`
```ts
{ address: string | null; chainId: number | null; connected: boolean; connecting: boolean; error: string | null }
```

---

## Module: `src/aegis/config.ts`

Network constants and address configuration.

```ts
CHAIN_ID          // 61999 (GenLayer StudioNet)
RPC_URL           // https://studio.genlayer.com/api
EXPLORER_BASE     // https://explorer-studio.genlayer.com

POLICY_VAULT_ADDRESS
JUDGMENT_ENGINE_ADDRESS
AUTHORITY_GATE_ADDRESS
GUARDED_TARGET_ADDRESS

txUrl(hash)       // builds full explorer transaction URL
addrUrl(addr)     // builds full explorer address URL
```

---

## Module: `src/aegis/client.ts`

All contract interactions. Exports one class: `AegisClient`.

### Construction

```ts
const client = new AegisClient(signerOrProvider);
```

Accepts a genlayer-js signer (for writes) or provider (for reads).

### PolicyVault methods

| Method | Type | Returns |
|---|---|---|
| `publishPolicy(params)` | write | `txHash: string` |
| `activatePolicy(policyId)` | write | `txHash: string` |
| `getPolicy(policyId)` | read | `Policy \| null` |
| `getActivePolicyId(protocolId)` | read | `string` |
| `isActive(policyId)` | read | `boolean` |
| `listPolicyIds()` | read | `string[]` |
| `getAllPolicies()` | read | `Policy[]` |

### JudgmentEngine methods

| Method | Type | Returns |
|---|---|---|
| `openIncident(params)` | write | `txHash: string` |
| `judgeIncident(incidentId)` | write | `txHash: string` |
| `getIncident(incidentId)` | read | `Incident \| null` |
| `listIncidentIds()` | read | `string[]` |
| `getAllIncidents()` | read | `Incident[]` |

### AuthorityGate methods

| Method | Type | Returns |
|---|---|---|
| `bindEngine(engineAddress)` | write | `txHash: string` |
| `executeToken(params)` | write | `txHash: string` |
| `syncToken(tokenId)` | write | `txHash: string` |
| `getToken(tokenId)` | read | `AuthorityToken \| null` |
| `listTokenIds()` | read | `string[]` |

### GuardedTarget methods

| Method | Type | Returns |
|---|---|---|
| `recordSignal(signalKey)` | write | `txHash: string` |
| `getTargetStatus()` | read | `TargetStatus` |
| `listSignalKeys()` | read | `string[]` |
| `listSuspensionHistory()` | read | `object[]` |

### Helpers

```ts
waitForReceipt(txHash)  // polls until transaction is finalized
```

---

## Hook: `src/aegis/useWallet.ts`

Wallet connection lifecycle hook.

```ts
const {
  wallet,           // WalletState
  connect,          // () => Promise<void>
  disconnect,       // () => void
  switchNetwork,    // () => Promise<void>
  getClient,        // () => AegisClient | null
  getReadClient,    // () => AegisClient
} = useWallet();
```

**Behaviour:**
- Silently reconnects on mount if the user was previously connected
- Listens to `accountsChanged` and `chainChanged` MetaMask events
- `getClient()` returns null if not connected; all write pages check this before submitting
- `getReadClient()` always returns a read-only client (no signing) — used by detail pages on load
- `switchNetwork()` calls `wallet_addEthereumChain` + `wallet_switchEthereumChain` with StudioNet params

---

## Pages

### `LandingPage` (`/`)

Hero section with animated SVG shield and tag line. Three feature cards (policy commit, validator judgment, authority gate). Live stats strip (policy count, incident count, token count, target status) fetched on mount from all four contracts.

### `CommandPage` (`/command`)

Two-column live feed. Left: policies list with active status badges, protocol IDs, versions. Right: incidents list with verdict badges, judgment counts, expiry countdowns. Both refresh every 30 seconds. Click any row navigates to detail.

### `PolicyNewPage` (`/policy/new`)

Multi-field form for publishing a new policy. Includes an autofill button with sensible defaults. Validates all constraints client-side before submitting. Shows a `TxStatus` panel during submission. On success, navigates to the new policy's detail page.

### `PolicyDetailPage` (`/policy/:id`)

Shows all policy fields, policy hash, version, active/inactive status, activation readiness countdown. Activate button shown if caller is the owner and delay has elapsed. Lists all incidents linked to this policy with status badges. Link to open a new incident.

### `IncidentNewPage` (`/incident/new`)

Form pre-filled with `policy_id` from router state (passed from PolicyDetailPage). Source URL fields (up to 4). Duration slider capped at `policy.max_suspend_minutes`. Rationale textarea. TxStatus panel on submit.

### `IncidentDetailPage` (`/incident/:id`)

Shows all incident fields, op_digest, expiry countdown, judgment count. If `verdict_json` is populated, renders the full verdict panel: verdict badge, rationale, matched rules, key findings, and a per-source state table with HTTP status and content digest. Judge button for owner. Token detail link if AUTHORITY_PENDING.

### `TokenDetailPage` (`/token/:id`)

Shows all token fields, expiry countdown, state badge. Execute button (only for holder, only if ISSUED and not expired). Sync button (only if DISPATCHED). Links to incident and target explorer.

### `TargetPage` (`/target`)

Live GuardedTarget status: suspended/active indicator, signal count, suspension countdown (if suspended). Record Signal form. Suspension history table. All data refreshes every 15 seconds.

---

## Components

### `StatusBadge`

```tsx
<StatusBadge type="incident" value="OPEN" />
<StatusBadge type="verdict" value="CONFIRMED" />
<StatusBadge type="token" value="APPLIED" />
```

Maps status strings to colour classes. Renders a small coloured pill.

### `WalletButton`

Shows connect / disconnect / switch-network based on `WalletState`. On mobile collapses to address-only.

### `Navbar`

Sticky top navigation with the Aegis logo (SVG hexagon shield), page links, and WalletButton. Highlights the active route.

### `TxStatus`

```tsx
<TxStatus hash={txHash} error={error} loading={loading} explorerBase={EXPLORER_BASE} />
```

Shows spinner during pending, hash link when submitted, error message on failure. Auto-fades on success after 8 seconds.

---

## Utilities: `src/utils/format.ts`

| Function | Description |
|---|---|
| `shortAddr(addr)` | `0x1234...5678` |
| `shortHash(hash)` | `0xabcd...ef12` |
| `formatGEN(wei)` | Formats GEN amount with 4 decimal places |
| `formatTs(unix)` | `Oct 5, 2026 09:14 UTC` |
| `formatCountdown(unix)` | `14m 32s` / `Expired` |
| `formatDuration(mins)` | `1 h 30 m` / `45 m` |
