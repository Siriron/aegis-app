# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""
GuardedTarget — Aegis Protocol

A non-custodial demo target contract that demonstrates a real guarded operation.

The guarded operation (`record_signal`) changes authoritative contract state.
The AuthorityGate can suspend it for a bounded duration via a finalized child call.
There is no user-value custody, no payable deposit, and no external payout.

Governance address is the deployer. The JudgmentEngine checks this before
issuing an authority token so an unrelated policy owner cannot control this target.
"""

import json
from genlayer import *


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
        return value.as_hex.lower()
    return Address(value).as_hex.lower()


class GuardedTarget(gl.Contract):
    gate_address: str
    governance_address: str
    suspended_until: u256
    signal_count: u256
    last_signal_json: str
    signal_records: TreeMap[str, str]
    signal_keys: DynArray[str]
    suspension_history: DynArray[str]
    applied_ops: TreeMap[str, str]      # token_id -> op_digest
    applied_op_until: TreeMap[str, u256]

    def __init__(self, gate_address: str):
        self.gate_address       = _addr(gate_address)
        self.governance_address = _addr(gl.message.sender_address)
        self.suspended_until    = u256(0)
        self.signal_count       = u256(0)
        self.last_signal_json   = ""

    def _require_gate_caller(self) -> None:
        if _addr(gl.message.sender_address) != self.gate_address:
            raise gl.vm.UserError("only the AuthorityGate may call emergency methods")

    def _require_direct_eoa(self) -> str:
        sender = _addr(gl.message.sender_address)
        origin = _addr(gl.message.origin_address)
        if sender != origin:
            raise gl.vm.UserError("guarded operations require a direct EOA call")
        return sender

    def _check_already_applied(self, token_id: str, op_digest: str) -> bool:
        existing = self.applied_ops.get(token_id, "")
        if not existing:
            return False
        if existing != op_digest:
            raise gl.vm.UserError("token_id is bound to a different op_digest")
        return True

    @gl.public.write
    def record_signal(self, signal_key: str) -> u256:
        """
        The guarded operation. Records a unique signal key in contract state.
        Rejected while a valid emergency suspension is active.
        """
        now = _now()
        if now < int(self.suspended_until):
            raise gl.vm.UserError("guarded operation is suspended — emergency authority active")
        caller = self._require_direct_eoa()
        key = str(signal_key).strip()
        if not key or len(key) > 128:
            raise gl.vm.UserError("invalid signal_key")
        if self.signal_records.get(key, ""):
            raise gl.vm.UserError("signal already recorded")

        next_count = u256(int(self.signal_count) + 1)
        record = {
            "signal_key": key,
            "caller": caller,
            "recorded_at": now,
            "sequence": int(next_count),
        }
        encoded = json.dumps(record, sort_keys=True)
        self.signal_records[key] = encoded
        self.signal_keys.append(key)
        self.last_signal_json = encoded
        self.signal_count = next_count
        return next_count

    @gl.public.write
    def apply_emergency_suspension(
        self,
        duration_minutes: int,
        incident_id: str,
        token_id: str,
        op_digest: str,
        holder: str,
    ) -> int:
        """Called only by AuthorityGate via finalized child emission."""
        self._require_gate_caller()
        if _addr(holder) != self.governance_address:
            raise gl.vm.UserError("holder is not the governance address for this target")
        if not (1 <= duration_minutes <= 1440):
            raise gl.vm.UserError("invalid suspension duration")
        if self._check_already_applied(token_id, op_digest):
            return int(self.applied_op_until.get(token_id, u256(0)))

        until_ts = _now() + int(duration_minutes) * 60
        if until_ts > int(self.suspended_until):
            self.suspended_until = u256(until_ts)

        record = {
            "token_id": token_id,
            "incident_id": incident_id,
            "op_digest": op_digest,
            "holder": _addr(holder),
            "duration_minutes": int(duration_minutes),
            "suspended_until": int(until_ts),
            "applied_at": _now(),
        }
        encoded = json.dumps(record, sort_keys=True)
        self.suspension_history.append(encoded)
        self.applied_ops[token_id]      = op_digest
        self.applied_op_until[token_id] = u256(until_ts)
        return until_ts

    # ── Views ──────────────────────────────────────────────────────────────

    @gl.public.view
    def get_status(self) -> str:
        # No clock in views: the caller compares suspended_until to its own time.
        return json.dumps({
            "gate_address":      self.gate_address,
            "governance_address": self.governance_address,
            "signal_count":      int(self.signal_count),
            "suspended_until":   int(self.suspended_until),
            "last_signal_json":  self.last_signal_json,
            "suspension_count":  len(self.suspension_history),
        }, sort_keys=True)

    @gl.public.view
    def get_signal(self, signal_key: str) -> str:
        return self.signal_records.get(signal_key, "")

    @gl.public.view
    def list_signal_keys(self) -> str:
        return json.dumps([self.signal_keys[i] for i in range(len(self.signal_keys))])

    @gl.public.view
    def list_suspension_history(self) -> str:
        return json.dumps([self.suspension_history[i] for i in range(len(self.suspension_history))])

    @gl.public.view
    def get_applied_op_digest(self, token_id: str) -> str:
        return self.applied_ops.get(token_id, "")

    @gl.public.view
    def get_governance_address(self) -> str:
        return self.governance_address

    @gl.public.view
    def is_governance_holder(self, holder: str) -> str:
        return json.dumps(_addr(holder) == self.governance_address)

    @gl.public.view
    def get_signal_count(self) -> str:
        return json.dumps(int(self.signal_count))
