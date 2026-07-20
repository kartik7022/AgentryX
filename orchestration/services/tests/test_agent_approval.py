# services/tests/test_agent_approval.py
"""AGENT-017: unit tests for AgentApprovalService (agent_approval.py)."""
from services.agent.agent_contract import AgentApprovalPolicy
from services.agent.agent_approval import (
    requires_approval, create_approval_request, get_approval_status, resolve_approval,
)


def test_mode_none_never_requires_approval():
    policy = AgentApprovalPolicy(mode="none")
    assert requires_approval("state_mutation", "webhook", policy) is False


def test_mode_required_for_all_actions_always_requires_approval():
    policy = AgentApprovalPolicy(mode="required_for_all_actions")
    assert requires_approval("read", "datasource_lookup", policy) is True


def test_auto_for_read_only_skips_read_only_tools():
    policy = AgentApprovalPolicy(mode="auto_for_read_only")
    assert requires_approval("read", "datasource_lookup", policy) is False
    assert requires_approval("read", "adapter_analyze", policy) is False


def test_auto_for_read_only_requires_approval_for_mutating_tools():
    policy = AgentApprovalPolicy(mode="auto_for_read_only")
    assert requires_approval("state_mutation", "webhook", policy) is True
    assert requires_approval("state_mutation", "human_review", policy) is True


def test_auto_for_read_only_honors_explicit_require_approval_for_list():
    # require_approval_for only has an effect for a tool name that isn't
    # already categorized as read-only or mutating in agent_approval.py's
    # fixed sets (e.g. a custom/future tool) — for any of the 6 built-in
    # tools, they're already definitively read-only or mutating before
    # this check is ever reached.
    policy = AgentApprovalPolicy(mode="auto_for_read_only", require_approval_for=["custom_future_tool"])
    assert requires_approval("read", "custom_future_tool", policy) is True
    assert requires_approval("read", "some_other_uncategorized_tool", policy) is False


class _FakeCursor:
    def __init__(self, store):
        self.store = store
        self._last_result = None
        self.rowcount = 0

    def execute(self, sql, params=None):
        if "INSERT INTO orchestration.agent_task_approvals" in sql:
            approval_id = params[0]
            self.store[approval_id] = {"status": "pending"}
        elif "SELECT status FROM orchestration.agent_task_approvals" in sql:
            approval_id = params[0]
            row = self.store.get(approval_id)
            self._last_result = (row["status"],) if row else None
        elif "UPDATE orchestration.agent_task_approvals" in sql:
            status, reviewed_by, decision_reason, approval_id = params
            row = self.store.get(approval_id)
            if row and row["status"] == "pending":
                row.update(status=status, reviewed_by=reviewed_by, decision_reason=decision_reason)
                self.rowcount = 1
            else:
                self.rowcount = 0

    def fetchone(self):
        return self._last_result


class _FakeConn:
    def __init__(self):
        self.store = {}
        self.committed = 0

    def cursor(self):
        return _FakeCursor(self.store)

    def commit(self):
        self.committed += 1


def test_create_and_resolve_approval_lifecycle():
    conn = _FakeConn()
    approval_id = create_approval_request(
        conn=conn, agent_run_id="run-1", execution_id="exec-1",
        tenant_id="t1", step_key="agent_step", approval_type="external_webhook",
        requested_action_json={"tool_name": "webhook", "tool_input": {}},
    )
    assert approval_id in conn.store
    assert get_approval_status(conn, approval_id) == "pending"

    resolved = resolve_approval(conn, approval_id, "approved", reviewed_by="reviewer@example.com")
    assert resolved is True
    assert get_approval_status(conn, approval_id) == "approved"

    # already resolved — resolving again should be a no-op
    resolved_again = resolve_approval(conn, approval_id, "rejected", reviewed_by="reviewer@example.com")
    assert resolved_again is False