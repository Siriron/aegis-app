#!/usr/bin/env node
/**
 * Aegis end-to-end lifecycle on GenLayer StudioNet.
 *
 * Deploys all four contracts from contracts/, binds the gate, then runs the full workflow with real
 * validator consensus and writes every transaction hash plus the resulting on-chain state to
 * docs/evidence/lifecycle-<timestamp>.md. It also rewrites the four addresses in src/aegis/config.ts.
 *
 *   npm install
 *   AEGIS_PRIVATE_KEY=0x...  node scripts/e2e-lifecycle.mjs      (StudioNet is gasless; a fresh key is fine)
 *
 * Without AEGIS_PRIVATE_KEY a throwaway key is generated and printed. Evidence sources are the three
 * static files in docs/evidence/ on this repo's main branch (override with AEGIS_EVIDENCE_BASE), so the
 * files must be pushed before running.
 *
 * Needs several minutes: consensus, finalization of two finalized emissions, and 1-minute timers.
 * Every step prints what it did and what the chain says. A failed step stops the run with the reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, createAccount, generatePrivateKey } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPLORER = 'https://explorer-studio.genlayer.com';
const BASE = process.env.AEGIS_EVIDENCE_BASE ?? 'https://raw.githubusercontent.com/Siriron/aegis-app/main/docs/evidence';
const SRC = { a: `${BASE}/feed-a.md`, b: `${BASE}/feed-b.md`, clear: `${BASE}/feed-clear.md` };
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN = STAMP.slice(5, 16).replace(/[^0-9]/g, '');

const key = process.env.AEGIS_PRIVATE_KEY ?? generatePrivateKey();
if (!process.env.AEGIS_PRIVATE_KEY) console.log(`Generated throwaway key (StudioNet is gasless): ${key}`);
const account = createAccount(key);
const client = createClient({ chain: studionet, account });
const log = [];
const txs = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (m) => { console.log(m); log.push(m); };

function inspect(tx) {
  const status = String(tx?.statusName ?? tx?.status ?? '');
  const result = tx?.txExecutionResultName;
  return { status, result };
}

async function settled(hash, status, label) {
  const tx = await client.waitForTransactionReceipt({ hash, status, retries: 240, interval: 5000 });
  const { status: st, result } = inspect(tx);
  if (result !== 'FINISHED_WITH_RETURN') throw new Error(`${label}: status ${st}, execution result ${result ?? 'unknown'} (not a success) — ${EXPLORER}/tx/${hash}`);
  return tx;
}

async function write(label, address, functionName, args = [], { finalize = false } = {}) {
  const hash = await client.writeContract({ address, functionName, args, value: 0n });
  say(`- ${label}: tx ${hash} submitted`);
  await settled(hash, TransactionStatus.ACCEPTED, label);
  let finalized = false;
  if (finalize) { await settled(hash, TransactionStatus.FINALIZED, label); finalized = true; }
  txs.push({ label, hash, finalized });
  say(`  - ${finalized ? 'FINALIZED' : 'ACCEPTED'} with execution result FINISHED_WITH_RETURN`);
  return hash;
}

async function expectFailure(label, address, functionName, args, needle) {
  const hash = await client.writeContract({ address, functionName, args, value: 0n });
  const tx = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 120, interval: 5000 });
  const { result } = inspect(tx);
  txs.push({ label: `${label} (expected rejection)`, hash, finalized: false });
  if (result === 'FINISHED_WITH_RETURN') throw new Error(`${label}: expected the contract to reject this call (${needle}) but it succeeded`);
  say(`- ${label}: rejected as expected (${result ?? 'error'}) — tx ${hash}`);
}

async function read(address, functionName, args = []) {
  const r = await client.readContract({ address, functionName, args });
  return typeof r === 'string' && r !== '' && /^[\[{]/.test(r) ? JSON.parse(r) : r;
}

async function until(label, fn, { tries = 60, every = 10000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

async function deploy(name, args = []) {
  const code = fs.readFileSync(path.join(ROOT, 'contracts', `${name}.py`), 'utf8');
  const hash = await client.deployContract({ code, args });
  say(`- deploy ${name}: tx ${hash} submitted`);
  const tx = await settled(hash, TransactionStatus.ACCEPTED, `deploy ${name}`);
  const addr = tx?.txDataDecoded?.contractAddress ?? tx?.data?.contract_address ?? tx?.recipient;
  if (!addr) throw new Error(`deploy ${name}: could not read the contract address from the receipt`);
  txs.push({ label: `deploy ${name}`, hash, finalized: false });
  say(`  - ${name} at ${addr}`);
  return addr;
}

async function main() {
  say(`# Aegis StudioNet lifecycle evidence — ${new Date().toISOString()}`);
  say(`Account: ${account.address}\n`);
  say('## 1. Deployment');
  const vault = await deploy('PolicyVault');
  const gate = await deploy('AuthorityGate');
  const engine = await deploy('JudgmentEngine', [vault, gate]);
  const target = await deploy('GuardedTarget', [gate]);
  await write('gate.bind_engine', gate, 'bind_engine', [engine]);
  say(`  - gate engine address now ${await read(gate, 'get_engine_address')}`);

  say('\n## 2. Policy: publish, wait out the activation delay, activate');
  const policyId = `pol-demo-${RUN}`;
  const protocolId = `proto-demo-${RUN}`;
  await write('vault.publish_policy', vault, 'publish_policy', [
    policyId, protocolId, 'Aegis Demo Protocol', target,
    'Suspend the guarded operation only when at least one approved source reports an active, confirmed exploit of the guarded operation and no approved source credibly denies it.',
    'Only the approved raw.githubusercontent.com evidence files count. A source that cannot be fetched is unavailable evidence, never support.',
    'raw.githubusercontent.com', 60n, 30n, 1n,
  ]);
  const pol = await read(vault, 'get_policy', [policyId]);
  say(`  - stored policy hash ${pol.policy_hash}, ready_after ${pol.ready_at ?? pol.ready_after}`);
  say('  - waiting 70s for the 1-minute activation delay');
  await sleep(70_000);
  await write('vault.activate_policy', vault, 'activate_policy', [policyId]);
  say(`  - vault active policy for ${protocolId}: ${await read(vault, 'get_active_policy_id', [protocolId])}`);

  say('\n## 3. Incident: open, judge (validator consensus), finalized token issuance');
  const incidentId = `inc-demo-${RUN}`;
  await write('engine.open_incident', engine, 'open_incident', [
    incidentId, policyId, 'SUSPEND_GUARDED_OPERATION', 1n,
    'Two approved feeds report a confirmed active exploit of the guarded operation; suspension is requested for one minute.',
    JSON.stringify([SRC.a, SRC.b]),
  ]);
  await write('engine.judge_incident', engine, 'judge_incident', [incidentId], { finalize: true });
  const inc = await read(engine, 'get_incident', [incidentId]);
  const verdict = JSON.parse(inc.verdict_json);
  say(`  - verdict ${verdict.verdict}; per-source states ${verdict.source_states.map(s => `${s.state}/HTTP ${s.http_status}`).join(', ')}`);
  say(`  - incident status ${inc.status}; verdict digest ${inc.verdict_digest}`);
  if (verdict.verdict !== 'CONFIRMED') {
    say('  - The validators did not confirm this demo incident, so no authority was issued. Nothing further can run; see the verdict rationale below.');
    say(`  - rationale: ${verdict.rationale}`);
    return;
  }
  const tokenId = inc.token_id;
  say('  - waiting for the finalized issue_token emission to reach the gate');
  let token = await until('token in AuthorityGate', async () => (await read(gate, 'get_token', [tokenId])) || null, { tries: 36 }).catch(() => null);
  if (!token) {
    say('  - token not found after 6 minutes; running the recovery path (sync_authority / retry_authority)');
    await write('engine.sync_authority', engine, 'sync_authority', [incidentId]);
    await sleep(Number(process.env.AEGIS_RETRY_WAIT_MS ?? 620_000));
    await write('engine.retry_authority', engine, 'retry_authority', [incidentId], { finalize: true });
    token = await until('token in AuthorityGate after retry', async () => (await read(gate, 'get_token', [tokenId])) || null, { tries: 36 });
  }
  say(`  - gate token ${tokenId}: state ${token.state}, expires ${token.expires_at}`);
  await write('engine.sync_authority', engine, 'sync_authority', [incidentId]);
  say(`  - incident status after sync: ${(await read(engine, 'get_incident', [incidentId])).status}`);

  say('\n## 4. Execute the token (finalized child call) and confirm the target state');
  const before = await read(target, 'get_status');
  say(`  - target before: suspended_until ${before.suspended_until}, signal_count ${before.signal_count}, rejected_count ${before.rejected_count}`);
  await write('gate.execute_token', gate, 'execute_token', [tokenId, target, 'SUSPEND_GUARDED_OPERATION', 1n], { finalize: true });
  const applied = await until('target applied the token digest', async () => (await read(target, 'get_applied_op_digest', [tokenId])) || null, { tries: 36 });
  const mid = await read(target, 'get_status');
  say(`  - target holds op digest ${applied}; suspended_until ${mid.suspended_until}`);

  say('\n## 5. Guarded operation rejected during suspension');
  await write('target.record_signal (during suspension)', target, 'record_signal', [`blocked-${RUN}`]);
  const rej = await read(target, 'get_status');
  say(`  - rejected_count ${rej.rejected_count}, signal_count ${rej.signal_count}`);
  say(`  - last rejection: ${rej.last_rejection_json}`);
  if (Number(rej.rejected_count) < 1 || Number(rej.signal_count) !== 0) throw new Error('the guarded operation was not rejected during suspension');

  say('\n## 6. Functionality restored after expiry');
  const waitMs = Math.max(0, (Number(mid.suspended_until) * 1000) - Date.now()) + 15_000;
  say(`  - waiting ${(waitMs / 1000).toFixed(0)}s for the suspension to expire`);
  await sleep(waitMs);
  await write('target.record_signal (after expiry)', target, 'record_signal', [`restored-${RUN}`]);
  const after = await read(target, 'get_status');
  say(`  - signal_count ${after.signal_count}, rejected_count ${after.rejected_count}`);
  if (Number(after.signal_count) !== 1) throw new Error('the guarded operation did not resume after the suspension expired');

  say('\n## 7. Settlement of the token and the incident');
  await write('gate.sync_token', gate, 'sync_token', [tokenId]);
  say(`  - gate token state: ${(await read(gate, 'get_token', [tokenId])).state}`);
  await write('engine.sync_authority', engine, 'sync_authority', [incidentId]);
  say(`  - incident status: ${(await read(engine, 'get_incident', [incidentId])).status}`);
  await expectFailure('gate.execute_token (replay of an applied token)', gate, 'execute_token', [tokenId, target, 'SUSPEND_GUARDED_OPERATION', 1n], 'token already applied');

  say('\n## 8. Contradicting evidence cannot confirm');
  const badId = `inc-contra-${RUN}`;
  await write('engine.open_incident (contradicting feeds)', engine, 'open_incident', [
    badId, policyId, 'SUSPEND_GUARDED_OPERATION', 1n,
    'Requesting suspension even though one approved feed reports all clear — this must not be confirmed.',
    JSON.stringify([SRC.a, SRC.clear]),
  ]);
  await write('engine.judge_incident (contradicting feeds)', engine, 'judge_incident', [badId], { finalize: true });
  const bad = await read(engine, 'get_incident', [badId]);
  const badVerdict = JSON.parse(bad.verdict_json);
  say(`  - verdict ${badVerdict.verdict}; states ${badVerdict.source_states.map(s => s.state).join(', ')}; incident status ${bad.status}; token issued: ${bad.token_id ? 'yes' : 'no'}`);
  if (badVerdict.verdict === 'CONFIRMED') throw new Error('contradicting evidence was confirmed — this must never happen');

  // Persist addresses and evidence.
  const cfgPath = path.join(ROOT, 'src/aegis/config.ts');
  let cfg = fs.readFileSync(cfgPath, 'utf8');
  for (const [name, addr] of [['VAULT_ADDRESS', vault], ['ENGINE_ADDRESS', engine], ['GATE_ADDRESS', gate], ['TARGET_ADDRESS', target]]) {
    cfg = cfg.replace(new RegExp(`(export const ${name}\\s*:\\s*string\\s*=\\s*)'0x[0-9a-fA-F]{40}'`), `$1'${addr}'`);
  }
  fs.writeFileSync(cfgPath, cfg);
  say('\n## Addresses written to src/aegis/config.ts');
  say([`PolicyVault ${vault}`, `JudgmentEngine ${engine}`, `AuthorityGate ${gate}`, `GuardedTarget ${target}`].map(l => `- ${l}`).join('\n'));
}

try {
  await main();
  say('\nRESULT: lifecycle completed.');
} catch (err) {
  say(`\nRESULT: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  const rows = txs.map(t => `| ${t.label} | [${t.hash.slice(0, 12)}…](${EXPLORER}/tx/${t.hash}) | ${t.finalized ? 'FINALIZED' : 'ACCEPTED'} |`).join('\n');
  const out = path.join(ROOT, 'docs/evidence', `lifecycle-${STAMP}.md`);
  fs.writeFileSync(out, `${log.join('\n')}\n\n## Transactions\n\n| Step | Transaction | Awaited status |\n|---|---|---|\n${rows}\n`);
  console.log(`Evidence written to ${path.relative(ROOT, out)}`);
}
