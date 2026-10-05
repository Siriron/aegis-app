# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""
PolicyVault — Aegis Protocol

Stores immutable, owner-bound emergency policy definitions.
Each policy freezes the rules a protocol agrees to be judged by BEFORE
any incident occurs. Policies cannot be edited; a new version must be
published and activated instead.

Concepts:
  - policy_id:   unique slug chosen by the publisher
  - protocol_id: the protocol family (first publisher owns it)
  - policy_hash: SHA-256 of the canonical frozen policy fields
  - ready_after: Unix timestamp before which this policy cannot be activated
"""

import hashlib
import json
import re
from genlayer import *


VALID_SLUG = re.compile(r"[A-Za-z0-9._:-]{4,96}")
VALID_HOST = re.compile(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?")
VALID_ACTION = "SUSPEND_GUARDED_OPERATION"


_DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def _is_leap_year(year) -> bool:
    return (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)


def _now() -> int:
    """
    gl.message_raw["datetime"] is an ISO-8601 UTC string with microseconds and a
    trailing Z, never a Unix integer. Parsed with integer arithmetic only (no
    float, no datetime). Returns 0 if the field is absent or malformed.
    """
    try:
        raw = gl.message_raw.get("datetime", None) if isinstance(gl.message_raw, dict) else None
        if not isinstance(raw, str) or len(raw) < 19:
            return 0
        s = raw.strip()
        if s.endswith("Z"):
            s = s[:-1]
        s = s.split(".")[0]
        date_part, _, time_part = s.partition("T")
        y_str, m_str, d_str = date_part.split("-")
        hh_str, mm_str, ss_str = time_part.split(":")
        if not (y_str.isdigit() and m_str.isdigit() and d_str.isdigit()
                and hh_str.isdigit() and mm_str.isdigit() and ss_str.isdigit()):
            return 0
        year, month, day = int(y_str), int(m_str), int(d_str)
        hour, minute, second = int(hh_str), int(mm_str), int(ss_str)
        if not (1970 <= year <= 9999 and 1 <= month <= 12 and 1 <= day <= 31):
            return 0
        if not (0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 60):
            return 0
        days = 0
        for y in range(1970, year):
            days += 366 if _is_leap_year(y) else 365
        for m in range(1, month):
            days += 29 if (m == 2 and _is_leap_year(year)) else _DAYS_IN_MONTH[m - 1]
        days += day - 1
        return days * 86400 + hour * 3600 + minute * 60 + second
    except Exception:
        return 0


def _addr(value) -> str:
    if hasattr(value, "as_hex"):
        return value.as_hex
    return Address(value).as_hex


def _sha256(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def _clean_host(raw: str) -> str:
    h = raw.strip().lower()
    if (
        not h or len(h) > 180 or "/" in h or "://" in h or "@" in h
        or " " in h or h.startswith(".") or h.endswith(".")
        or ".." in h or not VALID_HOST.fullmatch(h)
    ):
        raise gl.vm.UserError("invalid source host")
    return h


class PolicyVault(gl.Contract):
    policies: TreeMap[str, str]        # policy_id -> JSON
    policy_index: DynArray[str]        # ordered list of policy_ids
    protocol_owners: TreeMap[str, str] # protocol_id -> owner address
    protocol_versions: TreeMap[str, u256]
    active_policy: TreeMap[str, str]   # protocol_id -> active policy_id

    def __init__(self):
        pass

    def _require_slug(self, value: str, label: str) -> None:
        if not VALID_SLUG.fullmatch(value):
            raise gl.vm.UserError(f"invalid {label}: must match [A-Za-z0-9._:-]{{4,96}}")

    @gl.public.write
    def publish_policy(
        self,
        policy_id: str,
        protocol_id: str,
        protocol_name: str,
        guarded_target: str,
        trigger_rules: str,
        source_rules: str,
        allowed_sources_csv: str,
        max_suspend_minutes: int,
        authority_ttl_minutes: int,
        activation_delay_minutes: int,
    ) -> str:
        self._require_slug(policy_id, "policy_id")
        self._require_slug(protocol_id, "protocol_id")

        if policy_id in self.policies:
            raise gl.vm.UserError("policy_id already taken")

        caller = _addr(gl.message.sender_address)
        existing_owner = self.protocol_owners.get(protocol_id, "")
        if existing_owner and existing_owner != caller:
            raise gl.vm.UserError("only the protocol owner may add policy versions")
        if not existing_owner:
            self.protocol_owners[protocol_id] = caller

        protocol_name = protocol_name.strip()
        trigger_rules  = trigger_rules.strip()
        source_rules   = source_rules.strip()

        if not (2 <= len(protocol_name) <= 120):
            raise gl.vm.UserError("protocol_name must be 2–120 characters")
        if not (80 <= len(trigger_rules) <= 5000):
            raise gl.vm.UserError("trigger_rules must be 80–5000 characters")
        if not (40 <= len(source_rules) <= 3000):
            raise gl.vm.UserError("source_rules must be 40–3000 characters")
        if not (5 <= max_suspend_minutes <= 1440):
            raise gl.vm.UserError("max_suspend_minutes must be 5–1440")
        if not (5 <= authority_ttl_minutes <= 120):
            raise gl.vm.UserError("authority_ttl_minutes must be 5–120")
        if not (1 <= activation_delay_minutes <= 10080):
            raise gl.vm.UserError("activation_delay_minutes must be 1–10080")

        target_hex = _addr(guarded_target)

        hosts = []
        for raw in allowed_sources_csv.split(","):
            h = _clean_host(raw)
            if h not in hosts:
                hosts.append(h)
        if not (1 <= len(hosts) <= 8):
            raise gl.vm.UserError("allowed_sources_csv must list 1–8 hosts")

        published_at = _now()
        version = int(self.protocol_versions.get(protocol_id, u256(0))) + 1
        self.protocol_versions[protocol_id] = u256(version)

        core = {
            "policy_id": policy_id,
            "protocol_id": protocol_id,
            "protocol_name": protocol_name,
            "owner": caller,
            "guarded_target": target_hex,
            "trigger_rules": trigger_rules,
            "source_rules": source_rules,
            "allowed_sources": hosts,
            "max_suspend_minutes": int(max_suspend_minutes),
            "authority_ttl_minutes": int(authority_ttl_minutes),
            "activation_delay_minutes": int(activation_delay_minutes),
            "published_at": published_at,
            "ready_after": published_at + int(activation_delay_minutes) * 60,
            "version": version,
        }
        record = dict(core)
        record["policy_hash"] = _sha256(core)

        self.policies[policy_id] = json.dumps(record, sort_keys=True)
        self.policy_index.append(policy_id)
        return policy_id

    @gl.public.write
    def activate_policy(self, policy_id: str) -> str:
        raw = self.policies.get(policy_id, "")
        if not raw:
            raise gl.vm.UserError("policy not found")
        policy = json.loads(raw)

        caller = _addr(gl.message.sender_address)
        if caller != str(policy.get("owner", "")):
            raise gl.vm.UserError("only the policy owner may activate")
        if _now() < int(policy.get("ready_after", 0)):
            raise gl.vm.UserError("activation delay has not elapsed yet")

        protocol_id = str(policy["protocol_id"])
        current_active = self.active_policy.get(protocol_id, "")
        if current_active and current_active != policy_id:
            current_raw = self.policies.get(current_active, "")
            if current_raw:
                current = json.loads(current_raw)
                if int(policy.get("version", 0)) <= int(current.get("version", 0)):
                    raise gl.vm.UserError("cannot activate an older policy version")

        self.active_policy[protocol_id] = policy_id
        return policy_id

    # ── Views ──────────────────────────────────────────────────────────────

    @gl.public.view
    def get_policy(self, policy_id: str) -> str:
        return self.policies.get(policy_id, "")

    @gl.public.view
    def get_active_policy_id(self, protocol_id: str) -> str:
        return self.active_policy.get(protocol_id, "")

    @gl.public.view
    def is_active(self, policy_id: str) -> str:
        raw = self.policies.get(policy_id, "")
        if not raw:
            return json.dumps(False)
        policy = json.loads(raw)
        return json.dumps(self.active_policy.get(str(policy["protocol_id"]), "") == policy_id)

    @gl.public.view
    def get_protocol_owner(self, protocol_id: str) -> str:
        return self.protocol_owners.get(protocol_id, "")

    @gl.public.view
    def list_policy_ids(self) -> str:
        return json.dumps([self.policy_index[i] for i in range(len(self.policy_index))])
