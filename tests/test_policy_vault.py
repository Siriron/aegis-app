import json
import pytest
from conftest import warp, js, checksum

C = "contracts/PolicyVault.py"
TRIGGER = "Suspend the guarded operation when two independent status feeds both report a confirmed outage."
SOURCE = "Only the listed status and feed hosts count; vendor blog posts are not evidence."


def publish(c, policy_id="pol-1-v1", protocol="proto-alpha", target=None, hosts="status.example.org, feeds.example.org",
            max_min=60, ttl=30, delay=5, trigger=TRIGGER, source=SOURCE, name="Alpha"):
    return c.publish_policy(policy_id, protocol, name, target, trigger, source, hosts, max_min, ttl, delay)


@pytest.fixture
def vault(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    c = direct_deploy(C)
    warp(direct_vm)   # after deploy: the SDK module only exists once a contract is loaded
    return c


def test_publish_stores_the_record_the_engine_reads(vault, direct_vm, direct_alice, direct_bob):
    from conftest import hexaddr
    publish(vault, target=hexaddr(direct_bob))
    p = js(vault.get_policy("pol-1-v1"))
    # keys JudgmentEngine depends on
    for key in ("owner", "protocol_id", "protocol_name", "guarded_target", "trigger_rules", "source_rules",
                "allowed_sources", "max_suspend_minutes", "authority_ttl_minutes", "policy_hash"):
        assert key in p, key
    assert p["owner"] == checksum(direct_alice)
    assert p["guarded_target"] == checksum(direct_bob)
    assert p["allowed_sources"] == ["status.example.org", "feeds.example.org"]
    assert p["version"] == 1 and len(p["policy_hash"]) == 64
    assert js(vault.list_policy_ids()) == ["pol-1-v1"]
    assert vault.get_protocol_owner("proto-alpha") == checksum(direct_alice)


def test_hosts_are_lowercased_and_deduplicated(vault, direct_bob):
    from conftest import hexaddr
    publish(vault, target=hexaddr(direct_bob), hosts="Status.Example.ORG, status.example.org")
    assert js(vault.get_policy("pol-1-v1"))["allowed_sources"] == ["status.example.org"]


@pytest.mark.parametrize("kwargs,message", [
    ({"policy_id": "ab"}, "invalid policy_id"),
    ({"protocol": "bad id!"}, "invalid protocol_id"),
    ({"name": "A"}, "protocol_name"),
    ({"trigger": "too short"}, "trigger_rules"),
    ({"source": "too short"}, "source_rules"),
    ({"max_min": 4}, "max_suspend_minutes"),
    ({"max_min": 1441}, "max_suspend_minutes"),
    ({"ttl": 4}, "authority_ttl_minutes"),
    ({"ttl": 121}, "authority_ttl_minutes"),
    ({"delay": 0}, "activation_delay_minutes"),
    ({"delay": 10081}, "activation_delay_minutes"),
    ({"hosts": "https://status.example.org"}, "invalid source host"),
    ({"hosts": "status.example.org/path"}, "invalid source host"),
    ({"hosts": "user@status.example.org"}, "invalid source host"),
    ({"hosts": ".example.org"}, "invalid source host"),
    ({"hosts": ",".join(f"h{i}.example.org" for i in range(9))}, "1–8 hosts"),
])
def test_publish_validation(vault, direct_vm, direct_bob, kwargs, message):
    from conftest import hexaddr
    with direct_vm.expect_revert(message):
        publish(vault, target=hexaddr(direct_bob), **kwargs)


def test_policy_id_cannot_be_reused(vault, direct_vm, direct_bob):
    from conftest import hexaddr
    publish(vault, target=hexaddr(direct_bob))
    with direct_vm.expect_revert("policy_id already taken"):
        publish(vault, target=hexaddr(direct_bob))


def test_only_the_protocol_owner_can_add_versions(vault, direct_vm, direct_alice, direct_bob, direct_charlie):
    from conftest import hexaddr
    publish(vault, target=hexaddr(direct_bob))
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the protocol owner"):
        publish(vault, policy_id="pol-1-v2", target=hexaddr(direct_bob))
    direct_vm.sender = direct_alice
    publish(vault, policy_id="pol-1-v2", target=hexaddr(direct_bob))
    assert js(vault.get_policy("pol-1-v2"))["version"] == 2


def test_activation_requires_owner_and_elapsed_delay(vault, direct_vm, direct_alice, direct_bob, direct_charlie):
    from conftest import hexaddr
    publish(vault, target=hexaddr(direct_bob), delay=5)
    with direct_vm.expect_revert("activation delay has not elapsed"):
        vault.activate_policy("pol-1-v1")
    warp(direct_vm, "2026-10-10T10:04:59Z")
    with direct_vm.expect_revert("activation delay has not elapsed"):
        vault.activate_policy("pol-1-v1")
    warp(direct_vm, "2026-10-10T10:05:00Z")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the policy owner"):
        vault.activate_policy("pol-1-v1")
    direct_vm.sender = direct_alice
    assert vault.get_active_policy_id("proto-alpha") == ""
    vault.activate_policy("pol-1-v1")
    assert vault.get_active_policy_id("proto-alpha") == "pol-1-v1"
    assert js(vault.is_active("pol-1-v1")) is True


def test_unknown_policy_activation_reverts(vault, direct_vm):
    with direct_vm.expect_revert("policy not found"):
        vault.activate_policy("missing-policy")
    assert js(vault.is_active("missing-policy")) is False


def test_newer_version_replaces_older_but_never_the_reverse(vault, direct_vm, direct_bob):
    from conftest import hexaddr
    publish(vault, policy_id="pol-1-v1", target=hexaddr(direct_bob), delay=1)
    publish(vault, policy_id="pol-1-v2", target=hexaddr(direct_bob), delay=1)
    warp(direct_vm, "2026-10-10T10:01:00Z")
    vault.activate_policy("pol-1-v2")
    with direct_vm.expect_revert("cannot activate an older policy version"):
        vault.activate_policy("pol-1-v1")
    assert vault.get_active_policy_id("proto-alpha") == "pol-1-v2"
    assert js(vault.is_active("pol-1-v1")) is False


def test_policy_hash_changes_when_any_committed_field_changes(vault, direct_bob):
    from conftest import hexaddr
    publish(vault, policy_id="pol-1-v1", target=hexaddr(direct_bob), max_min=60)
    publish(vault, policy_id="pol-1-v2", target=hexaddr(direct_bob), max_min=61)
    assert js(vault.get_policy("pol-1-v1"))["policy_hash"] != js(vault.get_policy("pol-1-v2"))["policy_hash"]
