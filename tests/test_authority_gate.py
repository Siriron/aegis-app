import hashlib
import json
import pytest
from conftest import warp, js, hexaddr, checksum, epoch

C = "contracts/AuthorityGate.py"
T0 = "2026-10-10T10:00:00Z"
ACTION = "SUSPEND_GUARDED_OPERATION"


def op_digest(incident_id, policy_hash, target, action=ACTION, minutes=30):
    payload = {"incident_id": incident_id, "policy_hash": policy_hash, "target": checksum(target),
               "action_class": action, "duration_minutes": minutes}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


@pytest.fixture
def ctx(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, world):
    """alice deploys the gate and is the token holder, bob is the bound engine, charlie the target."""
    direct_vm.sender = direct_alice
    gate = direct_deploy(C)
    warp(direct_vm, T0)
    gate.bind_engine(hexaddr(direct_bob))
    return gate


def issue(gate, vm, engine, holder, target, token="AGT-inc-1", incident="inc-1", minutes=30, ttl=1800,
          action=ACTION, digest=None, policy_hash="p" * 64):
    digest = digest or op_digest(incident, policy_hash, target, action, minutes)
    vm.sender = engine
    return gate.issue_token(token, incident, hexaddr(holder), hexaddr(target), action, minutes, digest,
                            policy_hash, "j" * 64, ttl)


def test_only_the_deployer_binds_the_engine_once(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    gate = direct_deploy(C)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only deployer"):
        gate.bind_engine(hexaddr(direct_bob))
    direct_vm.sender = direct_alice
    assert gate.bind_engine(hexaddr(direct_bob)) == checksum(direct_bob)
    assert gate.get_engine_address() == checksum(direct_bob)
    with direct_vm.expect_revert("already bound"):
        gate.bind_engine(hexaddr(direct_alice))


def test_tokens_cannot_be_issued_before_the_engine_is_bound(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    direct_vm.sender = direct_alice
    gate = direct_deploy(C)
    warp(direct_vm, T0)
    with direct_vm.expect_revert("only the bound JudgmentEngine"):
        issue(gate, direct_vm, direct_bob, direct_alice, direct_charlie)


def test_only_the_bound_engine_issues_tokens(ctx, direct_vm, direct_alice, direct_charlie):
    with direct_vm.expect_revert("only the bound JudgmentEngine"):
        issue(ctx, direct_vm, direct_alice, direct_alice, direct_charlie)


def test_issue_stores_a_bounded_token(ctx, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)
    t = js(ctx.get_token("AGT-inc-1"))
    assert t["state"] == "ISSUED" and t["holder"] == checksum(direct_alice)
    assert t["target"] == checksum(direct_charlie)
    assert t["expires_at"] == epoch(T0) + 1800
    assert js(ctx.list_token_ids()) == ["AGT-inc-1"]
    assert ctx.get_token("missing") == ""


@pytest.mark.parametrize("kwargs,message", [
    ({"action": "DRAIN_VAULT"}, "unsupported action class"),
    ({"minutes": 0}, "invalid duration_minutes"),
    ({"minutes": 1441}, "invalid duration_minutes"),
    ({"ttl": 59}, "invalid ttl_seconds"),
    ({"ttl": 7201}, "invalid ttl_seconds"),
])
def test_issue_validation(ctx, direct_vm, direct_alice, direct_bob, direct_charlie, kwargs, message):
    with direct_vm.expect_revert(message):
        issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie, **kwargs)


def test_token_id_is_unique(ctx, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)
    with direct_vm.expect_revert("token_id already exists"):
        issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)


def execute(gate, vm, holder, target, action=ACTION, minutes=30, token="AGT-inc-1"):
    vm.sender = holder
    return gate.execute_token(token, hexaddr(target), action, minutes)


def test_execute_dispatches_exactly_the_bound_action(ctx, world, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)
    assert execute(ctx, direct_vm, direct_alice, direct_charlie) == ACTION
    assert js(ctx.get_token("AGT-inc-1"))["state"] == "DISPATCHED"
    assert len(world.emitted) == 1
    msg = world.emitted[0]
    assert msg["to"] == hexaddr(direct_charlie).lower() and msg["on"] == "finalized"
    assert msg["method"] == "apply_emergency_suspension"
    minutes, incident, token, digest, holder = msg["args"]
    assert (minutes, incident, token) == (30, "inc-1", "AGT-inc-1")
    assert digest == op_digest("inc-1", "p" * 64, direct_charlie)
    assert holder == checksum(direct_alice)


def test_only_the_designated_holder_executes(ctx, world, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)
    with direct_vm.expect_revert("only the designated holder"):
        execute(ctx, direct_vm, direct_bob, direct_charlie)
    assert world.emitted == []


@pytest.mark.parametrize("override,message", [
    ({"action": "OTHER"}, "action class mismatch"),
    ({"minutes": 31}, "duration mismatch"),
])
def test_execute_envelope_must_match_the_token(ctx, world, direct_vm, direct_alice, direct_bob, direct_charlie, override, message):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)
    with direct_vm.expect_revert(message):
        execute(ctx, direct_vm, direct_alice, direct_charlie, **override)
    assert world.emitted == []


def test_execute_rejects_a_different_target(ctx, world, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)
    with direct_vm.expect_revert("target address mismatch"):
        execute(ctx, direct_vm, direct_alice, direct_bob)
    assert world.emitted == []


def test_execute_rejects_a_token_whose_digest_does_not_match_the_envelope(ctx, world, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie, digest="f" * 64)
    with direct_vm.expect_revert("operation digest mismatch"):
        execute(ctx, direct_vm, direct_alice, direct_charlie)
    assert world.emitted == []


def test_expired_tokens_cannot_execute_in_any_state(ctx, world, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie, ttl=60)
    execute(ctx, direct_vm, direct_alice, direct_charlie)           # DISPATCHED, still inside the window
    warp(direct_vm, "2026-10-10T10:01:01Z")
    with direct_vm.expect_revert("token has expired"):
        execute(ctx, direct_vm, direct_alice, direct_charlie)       # re-dispatch after expiry is refused
    assert len(world.emitted) == 1


def test_unknown_token_reverts(ctx, direct_vm, direct_alice, direct_charlie):
    with direct_vm.expect_revert("token not found"):
        execute(ctx, direct_vm, direct_alice, direct_charlie, token="AGT-missing")
    with direct_vm.expect_revert("token not found"):
        ctx.sync_token("AGT-missing")


def test_sync_marks_applied_only_when_the_target_reports_the_digest(ctx, world, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)
    execute(ctx, direct_vm, direct_alice, direct_charlie)
    digest = op_digest("inc-1", "p" * 64, direct_charlie)

    world.stub_view(direct_charlie, "get_applied_op_digest", "")
    direct_vm.sender = direct_alice
    assert ctx.sync_token("AGT-inc-1") == "DISPATCHED"
    assert js(ctx.get_token("AGT-inc-1"))["state"] == "DISPATCHED"

    world.stub_view(direct_charlie, "get_applied_op_digest", "0" * 64)    # wrong digest does not count
    assert ctx.sync_token("AGT-inc-1") == "DISPATCHED"

    world.stub_view(direct_charlie, "get_applied_op_digest", digest)
    assert js(ctx.get_token("AGT-inc-1"))["state"] == "APPLIED"          # view reflects it
    assert ctx.sync_token("AGT-inc-1") == "APPLIED"
    assert js(ctx.get_token("AGT-inc-1"))["applied_at"] == epoch(T0)

    with direct_vm.expect_revert("token already applied"):
        execute(ctx, direct_vm, direct_alice, direct_charlie)


def test_only_the_holder_can_sync(ctx, world, direct_vm, direct_alice, direct_bob, direct_charlie):
    issue(ctx, direct_vm, direct_bob, direct_alice, direct_charlie)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the holder may sync"):
        ctx.sync_token("AGT-inc-1")
