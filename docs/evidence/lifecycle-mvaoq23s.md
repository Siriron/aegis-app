# Lifecycle evidence: run `mvaoq23s` (StudioNet, Oct 2026)

Driven through the deployed app (Test Guide page) by the governance wallet `0x40edE296E01e1D57b25697b07D0f1c69077843D0`. Contracts: PolicyVault `0x2f2E…2148`, AuthorityGate `0xb403…2e57`, JudgmentEngine `0x92F5…c0E0`, GuardedTarget `0x8100…9Cf1`; engine bound to the gate in [`0x53fea62d…197279`](https://explorer-studio.genlayer.com/tx/0x53fea62dbff07449c29abe02545ea42a189e4b56e39cceac4ec0574ab7197279). Times are as shown by the explorer ("Created At"). Every transaction below was opened on the explorer: status FINALIZED, consensus Accepted, GenVM execution result as stated.

## Result, read from the chain by the app (Test Guide steps 1-10 all green)

| Step | Result |
|---|---|
| 1-2 | Policy `pol-demo-mvaoq23s` (protocol `aegis-demo-40ede2`) published and activated |
| 3-4 | Incident judged **CONFIRMED**, finalized and verified |
| 5 | Authority token state **APPLIED** |
| 6 | Token executed; GuardedTarget suspended |
| 7 | Guarded operation `blocked-1` **rejected on-chain** during suspension; `rejected_count` = 2 |
| 8 | After both suspensions expired, operation `restored-2` **recorded** (`sequence` 2); `signal_count` = 2, `rejected_count` still 2, target status "Guarded operation active" |
| 9 | Incident settled: **SUSPENSION_APPLIED** |
| 10 | Contradicting evidence: **CONFLICTING**, no token issued |

## Transactions

**Policy**

| Call | Tx | Result |
|---|---|---|
| PolicyVault.publish_policy | [`0x5264373c…0258d3`](https://explorer-studio.genlayer.com/tx/0x5264373c3a5d1a6e8d94a4ecf0d417f9c89d7cc0bfa7d6bc9181ec27c10258d3) | policy published |
| PolicyVault.activate_policy | [`0x4fb76788…dfb6f1`](https://explorer-studio.genlayer.com/tx/0x4fb76788457dc5d73fbd56a799b19daddd2aec0476d2858eea6beb26e0dfb6f1) | finalized |

**Incident 1, `inc-demo-mvaoq23s` (5 min suspension, feeds A + B), opened Oct 16 2:14:19 PM**

| Call | Tx |
|---|---|
| JudgmentEngine.open_incident (SUCCESS, returns the incident ID) | [`0xe353d1e0…8d3d4e`](https://explorer-studio.genlayer.com/tx/0xe353d1e0519c31ecedd72d9f913f8df360fe9582dafa67a85893883a998d3d4e) |
| JudgmentEngine.judge_incident | [`0xbb1eba28…e02ead`](https://explorer-studio.genlayer.com/tx/0xbb1eba2861f19ef820d4db46470dbcdd9ecc971c4193e4065c10263cdce02ead) |
| AuthorityGate.issue_token (emitted by the engine) | [`0xfaba81a0…27dc91`](https://explorer-studio.genlayer.com/tx/0xfaba81a0db423461984ddbdffea5e504ba6f0aa873d5e072904a8ed58827dc91) |
| AuthorityGate.execute_token | [`0x7aff1ef0…8fb2fa`](https://explorer-studio.genlayer.com/tx/0x7aff1ef0e3eb7bc8d685947af0ce1d294ac42ac53a7841c486627947938fb2fa) |
| GuardedTarget.apply_emergency_suspension | [`0xc9314e54…321e31`](https://explorer-studio.genlayer.com/tx/0xc9314e54be4ef642f81d925f6a7c01a85bec7562c136a874b9fa598d23321e31) |

**Guarded operation recorded while not suspended**

| Call | Tx | Result |
|---|---|---|
| GuardedTarget.record_signal(`restored-1`), Oct 16 2:32:48 PM | [`0x8e62d69d…11e7dd`](https://explorer-studio.genlayer.com/tx/0x8e62d69d0fe246fa791be181eb6e6ad8e7549f7ce43077a8a05d91936411e7dd) | SUCCESS, returns 1 (recorded) |

**Incident 2, `inc-demo-mvaoq23s-2` (10 min suspension, feeds A + B), opened Oct 16 2:38:53 PM**

| Call | Tx |
|---|---|
| JudgmentEngine.open_incident (SUCCESS) | [`0xc419abee…0c8c2e`](https://explorer-studio.genlayer.com/tx/0xc419abeed8f2826c3af76eb17ef3eec6904bef9cbbdc6b94bbd3ce194b0c8c2e) |
| JudgmentEngine.judge_incident | [`0x9f101a68…2837cb`](https://explorer-studio.genlayer.com/tx/0x9f101a681a9d0fe2af2f9833745f005fdec384a1e8345bae454df1bdb12837cb) |
| AuthorityGate.issue_token (emitted by the engine) | [`0xfff35b8d…3568f9`](https://explorer-studio.genlayer.com/tx/0xfff35b8d6564c8d283648aca865135c4f7f2abc264313a9816741ebd9c3568f9) |
| AuthorityGate.execute_token | [`0x14448956…1d1364`](https://explorer-studio.genlayer.com/tx/0x14448956b45f079ec0e78a837d3f552d548b6be11b91dc36a1e59fbdc91d1364) |
| GuardedTarget.apply_emergency_suspension | [`0xd3811646…c1a487`](https://explorer-studio.genlayer.com/tx/0xd3811646720c7e0f49a334816f8e9610df4bec055c530ad4765ff33014c1a487) |

**Guarded operations rejected during that suspension**

| Call | Tx | Result |
|---|---|---|
| GuardedTarget.record_signal(`blocked-1`), Oct 16 2:45:57 PM | [`0xad99f1d7…dbc0dd`](https://explorer-studio.genlayer.com/tx/0xad99f1d772801d8981b6d3b6ebea135d351f7814f3c2984679da50817bdbc0dd) | SUCCESS, returns 0 (rejected, counted) |
| GuardedTarget.record_signal(`blocked-1`), Oct 16 2:46:46 PM | [`0x215635d6…e794d6`](https://explorer-studio.genlayer.com/tx/0x215635d630447df4eb75431026ac0ec6b21d82e45effe6be4aff5b2fd0e794d6) | SUCCESS, returns 0 (rejected, counted) |

**Functionality restored after expiry**

The last rejection was inside the second suspension (`suspended_until` 1792140862, read from the target). The call below was made about 24 hours later, with the target active and 2 suspensions on record.

| Call | Tx | Result |
|---|---|---|
| GuardedTarget.record_signal(`restored-2`), Oct 17 2:45:59 PM | [`0x395d591f…0855f7`](https://explorer-studio.genlayer.com/tx/0x395d591f25d41b9148d2373a62387e0567857fe785c26adfbfe4d46b1b0855f7) | FINALIZED, SUCCESS, returns 2 (recorded, `sequence` 2; `recorded_at` 1792226759) |

**Settlement**

| Call | Tx |
|---|---|
| JudgmentEngine.sync_authority | [`0x79412fac…3ec833`](https://explorer-studio.genlayer.com/tx/0x79412fac9b1869aa2635c2dbe48f03c5868721734d57394e5f7344445d3ec833) |

**Contradicting evidence, `inc-contra-mvaoq23s` (feed A says exploit, feed C says all clear), Oct 17 2:33-2:34 PM**

| Call | Tx | Result |
|---|---|---|
| JudgmentEngine.open_incident | [`0x19a30ce7…b270a0`](https://explorer-studio.genlayer.com/tx/0x19a30ce73fefec901cb257b86b488c83f7c57479c3578429df5eb48fa4b270a0) | SUCCESS |
| JudgmentEngine.judge_incident | [`0x940fb0cc…269921`](https://explorer-studio.genlayer.com/tx/0x940fb0ccb2878f286d2e197b5067a8d8314953604ebc68582508b8787f269921) | SUCCESS, verdict **CONFLICTING**; feed A state SUPPORTS, feed C state CONTRADICTS, both HTTP 200, content digests recorded; no token |

## Failed attempt kept for the record

`0xfdf1a63b669e95d13a83c126d1ab77c3da9f63c994e59be97f77e6482e966d73` (`open_incident`, run `mvc4mp2n`, Oct 17 2:27 PM): consensus Accepted and FINALIZED, but GenVM execution result **ERROR** (Rollback), message `policy not found in PolicyVault`, because that run's policy was never published. The app reports such a transaction as a failure, not a success. The JudgmentEngine's transaction list shows it as the one ERROR among 11 transactions.

## What this does and does not show

- The whole workflow on StudioNet with real validator consensus: policy, judgment, token issuance, execution, rejection during suspension, function restored after suspension expiry (`restored-2`), settlement, and a contradicting-evidence incident that does not confirm.
- Evidence sources are three static operator-written files in `docs/evidence/`; this proves validators agree on what committed sources say, not that the sources are true. StudioNet is temporary: addresses may not survive resets.
