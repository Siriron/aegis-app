#!/usr/bin/env python3
"""Cross-check the Aegis frontend against the real contract ABIs (genvm-lint schema --json).

client.ts calls contracts through two helpers, viewCall(ADDR, 'method', ...) and
walletSend(ADDR, 'method', ...). This script reads those call sites, maps each address constant to its
contract file and fails (exit 1) on: an unknown method, a view sent with walletSend, a write read with
viewCall, or a contract method the UI never calls.
"""
import json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTRACTS = {
    "VAULT_ADDRESS": "PolicyVault",
    "ENGINE_ADDRESS": "JudgmentEngine",
    "GATE_ADDRESS": "AuthorityGate",
    "TARGET_ADDRESS": "GuardedTarget",
}
# Constructors and bind_engine are deployment steps, performed by scripts/e2e-lifecycle.mjs / Studio.
DEPLOY_ONLY = {"AuthorityGate": {"bind_engine"}}
# Write methods that are only ever called by another Aegis contract (finalized emissions), never by a wallet.
CONTRACT_ONLY = {"AuthorityGate": {"issue_token"}, "GuardedTarget": {"apply_emergency_suspension"}}
# Read-only helpers kept for integrators and explorers; every write method must still be UI-reachable.
OPTIONAL_VIEWS = {"AuthorityGate": {"get_engine_address"},
                  "GuardedTarget": {"get_signal", "get_signal_count", "is_governance_holder"}}

text = "\n".join(f.read_text() for f in (ROOT / "src").rglob("*.ts*"))
bad = []
for const, name in CONTRACTS.items():
    out = subprocess.run(["genvm-lint", "schema", str(ROOT / "contracts" / f"{name}.py"), "--json"],
                         capture_output=True, text=True).stdout
    schema = json.loads(out[out.index("{"):])["schema"]["methods"]
    calls = {}
    for kind, helper in (("view", "viewCall"), ("write", "walletSend")):
        for m in re.finditer(rf"{helper}\(\s*{const}\s*,\s*'([A-Za-z0-9_]+)'", text):
            calls.setdefault(m.group(1), set()).add(kind)
    for method, kinds in sorted(calls.items()):
        if method not in schema:
            bad.append(f"{name}: UI calls unknown method '{method}'")
            continue
        ro = schema[method]["readonly"]
        if ro and "write" in kinds:
            bad.append(f"{name}.{method} is a view but is sent with walletSend")
        if not ro and "view" in kinds:
            bad.append(f"{name}.{method} is a write but is read with viewCall")
    for method in sorted(schema):
        allowed = DEPLOY_ONLY.get(name, set()) | CONTRACT_ONLY.get(name, set()) | OPTIONAL_VIEWS.get(name, set())
        if method not in calls and method not in allowed:
            bad.append(f"{name}.{method} is never called by the UI")
    print(f"{name}: {len(schema)} methods, {len(calls)} called from the UI")
print("\n".join(bad) if bad else "OK: every UI call matches its ABI and every method is reachable")
sys.exit(1 if bad else 0)
