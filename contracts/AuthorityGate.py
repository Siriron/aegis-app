# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""
AuthorityGate — Aegis Protocol

Receives finality-triggered authority tokens from the JudgmentEngine.
Each token is single-use, expiring, and bound to:
  holder, target, action class, duration, incident, policy hash.

Only the bound JudgmentEngine may issue tokens.
Only the bound holder may execute them.
Execution emits a finalized child call to the guarded target. If that call is lost or fails,
the holder may re-send it (bounded by a delay, MAX_DISPATCHES and the token's expiry); the target
applies each token_id at most once, so a re-send can never suspend twice. settle_token moves any
unapplied, expired token to the terminal state EXPIRED, so no token stays dispatched forever.
"""

import hashlib
import json
from genlayer import *

SUPPORTED_ACTION = "SUSPEND_GUARDED_OPERATION"
REDISPATCH_DELAY = 2 * 60   # seconds before a lost finalized child call may be re-sent
MAX_DISPATCHES = 3          # re-sends are always bounded by the token's own expiry as well


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


class AuthorityGate(gl.Contract):
    deployer: str
    engine_address: str
    tokens: TreeMap[str, str]       # token_id -> JSON
    token_index: DynArray[str]

    def __init__(self):
        self.deployer = _addr(gl.message.sender_address)
        self.engine_address = ""

    @gl.public.write
    def bind_engine(self, engine_address: str) -> str:
        if _addr(gl.message.sender_address) != self.deployer:
            raise gl.vm.UserError("only deployer may bind the engine")
        if self.engine_address:
            raise gl.vm.UserError("engine already bound — cannot rebind")
        self.engine_address = _addr(engine_address)
        return self.engine_address

    @gl.public.write
    def issue_token(
        self,
        token_id: str,
        incident_id: str,
        holder: str,
        target: str,
        action_class: str,
        duration_minutes: int,
        op_digest: str,
        policy_hash: str,
        judgment_digest: str,
        ttl_seconds: int,
    ) -> str:
        caller = _addr(gl.message.sender_address)
        if not self.engine_address or caller != self.engine_address:
            raise gl.vm.UserError("only the bound JudgmentEngine may issue tokens")
        if token_id in self.tokens:
            raise gl.vm.UserError("token_id already exists")
        if action_class not in (SUPPORTED_ACTION,):
            raise gl.vm.UserError("unsupported action class")
        if not (1 <= duration_minutes <= 1440):
            raise gl.vm.UserError("invalid duration_minutes")
        if not (60 <= ttl_seconds <= 7200):
            raise gl.vm.UserError("invalid ttl_seconds")

        issued_at = _now()
        record = {
            "token_id": token_id,
            "incident_id": incident_id,
            "holder": _addr(holder),
            "target": _addr(target),
            "action_class": action_class,
            "duration_minutes": int(duration_minutes),
            "op_digest": op_digest,
            "policy_hash": policy_hash,
            "judgment_digest": judgment_digest,
            "issued_at": issued_at,
            "expires_at": issued_at + int(ttl_seconds),
            "state": "ISSUED",
            "dispatched_at": 0,
            "dispatch_count": 0,
            "applied_at": 0,
        }
        self.tokens[token_id] = json.dumps(record, sort_keys=True)
        self.token_index.append(token_id)
        return token_id

    @gl.public.write
    def execute_token(
        self,
        token_id: str,
        target: str,
        action_class: str,
        duration_minutes: int,
    ) -> str:
        raw = self.tokens.get(token_id, "")
        if not raw:
            raise gl.vm.UserError("token not found")
        rec = json.loads(raw)

        caller = _addr(gl.message.sender_address)
        if caller != str(rec.get("holder", "")):
            raise gl.vm.UserError("only the designated holder may execute")

        state = str(rec.get("state", ""))
        now = _now()
        if state == "APPLIED":
            raise gl.vm.UserError("token already applied")
        if state == "EXPIRED":
            raise gl.vm.UserError("token has expired")
        if now > int(rec.get("expires_at", 0)):
            raise gl.vm.UserError("token has expired")

        target_hex = _addr(target)
        if target_hex != str(rec.get("target", "")):
            raise gl.vm.UserError("target address mismatch")
        if action_class != str(rec.get("action_class", "")):
            raise gl.vm.UserError("action class mismatch")
        if int(duration_minutes) != int(rec.get("duration_minutes", 0)):
            raise gl.vm.UserError("duration mismatch")

        # Recompute and verify the operation digest
        reconstructed = {
            "incident_id": str(rec["incident_id"]),
            "policy_hash": str(rec["policy_hash"]),
            "target": target_hex,
            "action_class": action_class,
            "duration_minutes": int(duration_minutes),
        }
        if _sha256(reconstructed) != str(rec.get("op_digest", "")):
            raise gl.vm.UserError("operation digest mismatch — envelope tampered")

        guarded = gl.get_contract_at(Address(target_hex))
        if state == "DISPATCHED":
            # Recovery path for a lost or failed finalized child call. The same op_digest is re-sent,
            # so GuardedTarget stays idempotent per token_id and the token still authorises one action.
            if str(guarded.view().get_applied_op_digest(token_id)) == str(rec.get("op_digest", "")):
                rec["state"] = "APPLIED"
                rec["applied_at"] = now
                self.tokens[token_id] = json.dumps(rec, sort_keys=True)
                return "APPLIED"
            if now < int(rec.get("dispatched_at", 0)) + REDISPATCH_DELAY:
                raise gl.vm.UserError("token was dispatched recently — wait before re-sending")
            if int(rec.get("dispatch_count", 1)) >= MAX_DISPATCHES:
                raise gl.vm.UserError("dispatch limit reached")

        rec["state"] = "DISPATCHED"
        rec["dispatched_at"] = now
        rec["dispatch_count"] = int(rec.get("dispatch_count", 0)) + 1
        self.tokens[token_id] = json.dumps(rec, sort_keys=True)

        if action_class == SUPPORTED_ACTION:
            guarded.emit(on="finalized").apply_emergency_suspension(
                int(duration_minutes),
                str(rec["incident_id"]),
                token_id,
                str(rec["op_digest"]),
                caller,
            )
        else:
            raise gl.vm.UserError("unsupported action class")

        return action_class

    @gl.public.write
    def sync_token(self, token_id: str) -> str:
        """Re-check whether the guarded target has applied this token."""
        raw = self.tokens.get(token_id, "")
        if not raw:
            raise gl.vm.UserError("token not found")
        rec = json.loads(raw)
        if _addr(gl.message.sender_address) != str(rec.get("holder", "")):
            raise gl.vm.UserError("only the holder may sync")
        if str(rec.get("state", "")) != "DISPATCHED":
            return str(rec.get("state", ""))

        guarded = gl.get_contract_at(Address(str(rec["target"])))
        stored = guarded.view().get_applied_op_digest(token_id)
        if str(stored) == str(rec.get("op_digest", "")):
            rec["state"] = "APPLIED"
            rec["applied_at"] = _now()
            self.tokens[token_id] = json.dumps(rec, sort_keys=True)
            return "APPLIED"
        return "DISPATCHED"

    @gl.public.write
    def settle_token(self, token_id: str) -> str:
        """
        Bring a token to a terminal state. Anyone may call it; it only records facts that can be
        checked: APPLIED if the target already holds this token's op_digest, EXPIRED if the token
        ran out unapplied. A dispatched token therefore can never stay unresolved past its expiry.
        """
        raw = self.tokens.get(token_id, "")
        if not raw:
            raise gl.vm.UserError("token not found")
        rec = json.loads(raw)
        state = str(rec.get("state", ""))
        if state in ("APPLIED", "EXPIRED"):
            return state
        guarded = gl.get_contract_at(Address(str(rec["target"])))
        if str(guarded.view().get_applied_op_digest(token_id)) == str(rec.get("op_digest", "")):
            rec["state"] = "APPLIED"
            rec["applied_at"] = _now()
        elif _now() > int(rec.get("expires_at", 0)):
            rec["state"] = "EXPIRED"
        else:
            return state
        self.tokens[token_id] = json.dumps(rec, sort_keys=True)
        return str(rec["state"])

    # ── Views ──────────────────────────────────────────────────────────────

    @gl.public.view
    def get_token(self, token_id: str) -> str:
        raw = self.tokens.get(token_id, "")
        if not raw:
            return ""
        rec = json.loads(raw)
        # Lazily reflect applied state without a write
        if str(rec.get("state", "")) == "DISPATCHED":
            try:
                guarded = gl.get_contract_at(Address(str(rec["target"])))
                stored = guarded.view().get_applied_op_digest(token_id)
                if str(stored) == str(rec.get("op_digest", "")):
                    rec["state"] = "APPLIED"
            except Exception:
                pass
        return json.dumps(rec, sort_keys=True)

    @gl.public.view
    def list_token_ids(self) -> str:
        return json.dumps([self.token_index[i] for i in range(len(self.token_index))])

    @gl.public.view
    def get_engine_address(self) -> str:
        return self.engine_address
