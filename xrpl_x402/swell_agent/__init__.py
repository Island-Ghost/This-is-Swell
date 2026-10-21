"""
swell_agent — Python counterpart of @swell/agent-wallet.

Shares the same `agent-policy.json` and the same SQLite audit database as the TypeScript CLI/MCP
server, so an agent written in either language spends against one budget and one audit trail.
"""

from .policy import SpendingPolicy, Decision, load_policy, evaluate
from .store import IntentStore
from .wallet import AgentWallet, ExecuteResult
from .payer import pay_for_resource, PayForResourceResult

__all__ = [
    "SpendingPolicy", "Decision", "load_policy", "evaluate",
    "IntentStore", "AgentWallet", "ExecuteResult",
    "pay_for_resource", "PayForResourceResult",
]
