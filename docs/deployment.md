# Aegis — Deployment and testing status

## Deploy and verify on StudioNet

```bash
npm install
pip install "genlayer-test==0.29.2" genvm-linter
node scripts/e2e-lifecycle.mjs        # optional: AEGIS_PRIVATE_KEY=0x...
```

The script deploys PolicyVault, AuthorityGate, JudgmentEngine and GuardedTarget, binds the engine to the gate, runs the full lifecycle with real validator consensus and writes `docs/evidence/lifecycle-<timestamp>.md` (every transaction hash, finality, on-chain state). It rewrites the four addresses in `src/aegis/config.ts`; commit that file and the evidence. Evidence sources are the static files in `docs/evidence/` on the `main` branch of this repository, so push them first.

Manual deployment through Studio is described in the README.

## Tests

```bash
genvm-lint download --version v0.2.16
for f in contracts/*.py; do genvm-lint check $f; genvm-lint typecheck $f; done
pytest tests -q -p no:cacheprovider
python scripts/check_ui_vs_abi.py
```

Every `direct_deploy` pins `sdk_version="v0.2.16"`. Unpinned, `genlayer-test` resolves the latest GenVM release, which can be a release candidate whose bundle is not published.

**Proves:** the real contract code under the GenVM SDK in direct mode, including validator agreement rules, fetch-failure handling, state guards and recovery paths.
**Does not prove:** real LLM behavior, real network behavior, real multi-validator timing, or the real cross-contract calls (stubbed). StudioNet is temporary; addresses may not survive resets.

## Live lifecycle evidence

The full workflow was run through the deployed app on StudioNet on Oct 17 2026 (run `mvaoq23s`): see [`docs/evidence/lifecycle-mvaoq23s.md`](./evidence/lifecycle-mvaoq23s.md) for the transactions and the on-chain state read at each step. The repository tests above prove contract logic in direct mode (stubbed cross-contract calls, mocked web and LLM); the evidence file is the live proof of the cross-contract flow. StudioNet is temporary: addresses may not survive resets.
