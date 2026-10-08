"""
Shared helpers for the Aegis direct-mode tests.

These tests execute the real contract code under the GenVM SDK (genlayer-test direct mode).
Only the outside world is mocked: web responses, LLM answers, and the *other* Aegis contracts
(direct mode cannot make cross-contract calls, so a small hook stubs CallContract / PostMessage).
"""
import json
import sys

import pytest

ISO = "2026-10-10T10:00:00Z"


def warp(direct_vm, value=ISO):
    """Set the transaction timestamp the contracts read from gl.message_raw["datetime"].

    genlayer-test's warp() patches datetime.now() but not message_raw, so set both."""
    direct_vm.warp(value)
    sys.modules["genlayer.gl"].message_raw["datetime"] = value


def epoch(iso):
    import datetime as dt
    return int(dt.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp())


def hexaddr(account):
    """Test accounts are raw bytes; contracts take 0x-hex strings."""
    if isinstance(account, (bytes, bytearray)):
        return "0x" + bytes(account).hex()
    return str(account)


def checksum(account):
    """The exact string the contracts store (Address.as_hex, EIP-55 casing)."""
    from genlayer.py.types import Address
    return Address(hexaddr(account)).as_hex


def js(value):
    return json.loads(value) if isinstance(value, str) else value


class World:
    """Stand-in for the other deployed contracts, installed as the VM's cross-contract hook."""

    def __init__(self):
        self.views = {}     # (address_hex_lower, method) -> callable(args) -> value
        self.emitted = []   # PostMessage records: {"to", "method", "args", "on"}

    def stub_view(self, address, method, fn):
        self.views[(hexaddr(address).lower(), method)] = fn if callable(fn) else (lambda args, v=fn: v)

    def _hex(self, addr):
        if hasattr(addr, "as_hex"):
            return addr.as_hex.lower()
        return hexaddr(addr).lower()

    def hook(self, vm, request):
        from genlayer.py import calldata
        if "CallContract" in request:
            req = request["CallContract"]
            data = req["calldata"]
            fn = self.views.get((self._hex(req["address"]), data.get("method")))
            if fn is None:
                return bytes([1]) + b"no stub for view call"
            return bytes([0]) + calldata.encode(fn(list(data.get("args", []))))
        if "PostMessage" in request:
            req = request["PostMessage"]
            data = req["calldata"]
            self.emitted.append({
                "to": self._hex(req["address"]),
                "method": data.get("method"),
                "args": list(data.get("args", [])),
                "on": req.get("on"),
            })
            return {"ok": None}
        return None


@pytest.fixture
def world(direct_vm):
    w = World()
    direct_vm._gl_call_hook = w.hook
    return w
