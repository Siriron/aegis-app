import pytest
from conftest import warp, js, hexaddr, checksum, epoch

C = "contracts/GuardedTarget.py"
T0 = "2026-10-10T10:00:00Z"
DIGEST = "d" * 64


@pytest.fixture
def target(direct_vm, direct_deploy, direct_alice, direct_bob):
    """alice deploys (so she is governance); bob plays the AuthorityGate."""
    direct_vm.sender = direct_alice
    c = direct_deploy(C, hexaddr(direct_bob))
    warp(direct_vm, T0)
    return c


def as_gate(vm, bob, origin):
    vm.sender = bob
    vm.origin = origin


def suspend(c, vm, bob, alice, minutes=30, token="AGT-inc-1", digest=DIGEST, holder=None):
    as_gate(vm, bob, alice)
    return c.apply_emergency_suspension(minutes, "inc-1", token, digest, holder or hexaddr(alice))


def test_constructor_binds_gate_and_governance(target, direct_alice, direct_bob):
    s = js(target.get_status())
    assert s["gate_address"] == hexaddr(direct_bob).lower()
    assert s["governance_address"] == hexaddr(direct_alice).lower()
    assert s["suspended_until"] == 0 and s["signal_count"] == 0
    assert js(target.is_governance_holder(hexaddr(direct_alice))) is True
    assert js(target.is_governance_holder(hexaddr(direct_bob))) is False


def test_guarded_operation_records_unique_signals(target, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    assert int(target.record_signal("sig-1")) == 1
    assert int(target.record_signal("sig-2")) == 2
    assert js(target.list_signal_keys()) == ["sig-1", "sig-2"]
    assert js(target.get_signal("sig-1"))["sequence"] == 1
    assert js(target.get_signal_count()) == 2
    with direct_vm.expect_revert("signal already recorded"):
        target.record_signal("sig-1")


@pytest.mark.parametrize("key", ["", "   ", "x" * 129])
def test_invalid_signal_keys_rejected(target, direct_vm, direct_alice, key):
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    with direct_vm.expect_revert("invalid signal_key"):
        target.record_signal(key)


def test_guarded_operation_requires_a_direct_eoa_call(target, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_bob          # a contract between the user and the target
    direct_vm.origin = direct_alice
    with direct_vm.expect_revert("direct EOA"):
        target.record_signal("sig-indirect")


def test_only_the_gate_can_apply_a_suspension(target, direct_vm, direct_alice, direct_charlie):
    as_gate(direct_vm, direct_charlie, direct_alice)
    with direct_vm.expect_revert("only the AuthorityGate"):
        target.apply_emergency_suspension(30, "inc-1", "AGT-inc-1", DIGEST, hexaddr(direct_alice))


def test_holder_must_be_the_governance_address(target, direct_vm, direct_alice, direct_bob, direct_charlie):
    as_gate(direct_vm, direct_bob, direct_alice)
    with direct_vm.expect_revert("not the governance address"):
        target.apply_emergency_suspension(30, "inc-1", "AGT-inc-1", DIGEST, hexaddr(direct_charlie))


@pytest.mark.parametrize("minutes", [0, 1441, -5])
def test_suspension_duration_bounds(target, direct_vm, direct_alice, direct_bob, minutes):
    as_gate(direct_vm, direct_bob, direct_alice)
    with direct_vm.expect_revert("invalid suspension duration"):
        target.apply_emergency_suspension(minutes, "inc-1", "AGT-inc-1", DIGEST, hexaddr(direct_alice))


def test_suspension_blocks_the_guarded_operation_until_it_expires(target, direct_vm, direct_alice, direct_bob):
    until = int(suspend(target, direct_vm, direct_bob, direct_alice, minutes=30))
    assert until == epoch(T0) + 30 * 60
    assert js(target.get_status())["suspended_until"] == until
    assert js(target.get_status())["suspension_count"] == 1
    assert target.get_applied_op_digest("AGT-inc-1") == DIGEST

    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    warp(direct_vm, "2026-10-10T10:29:59Z")
    with direct_vm.expect_revert("suspended"):
        target.record_signal("during-suspension")
    warp(direct_vm, "2026-10-10T10:30:00Z")
    assert int(target.record_signal("after-suspension")) == 1


def test_replaying_the_same_token_is_idempotent(target, direct_vm, direct_alice, direct_bob):
    first = int(suspend(target, direct_vm, direct_bob, direct_alice))
    warp(direct_vm, "2026-10-10T10:10:00Z")
    again = int(suspend(target, direct_vm, direct_bob, direct_alice))
    assert again == first
    assert js(target.get_status())["suspension_count"] == 1
    assert len(js(target.list_suspension_history())) == 1


def test_a_token_cannot_be_rebound_to_a_different_digest(target, direct_vm, direct_alice, direct_bob):
    suspend(target, direct_vm, direct_bob, direct_alice)
    with direct_vm.expect_revert("different op_digest"):
        suspend(target, direct_vm, direct_bob, direct_alice, digest="e" * 64)


def test_a_shorter_later_suspension_never_shortens_an_active_one(target, direct_vm, direct_alice, direct_bob):
    long_until = int(suspend(target, direct_vm, direct_bob, direct_alice, minutes=120, token="AGT-a"))
    suspend(target, direct_vm, direct_bob, direct_alice, minutes=10, token="AGT-b", digest="b" * 64)
    assert js(target.get_status())["suspended_until"] == long_until
    assert js(target.get_status())["suspension_count"] == 2


def test_a_longer_later_suspension_extends(target, direct_vm, direct_alice, direct_bob):
    suspend(target, direct_vm, direct_bob, direct_alice, minutes=10, token="AGT-a")
    longer = int(suspend(target, direct_vm, direct_bob, direct_alice, minutes=90, token="AGT-b", digest="b" * 64))
    assert js(target.get_status())["suspended_until"] == longer == epoch(T0) + 90 * 60
