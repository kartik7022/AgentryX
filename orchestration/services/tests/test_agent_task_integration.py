# services/tests/test_agent_task_integration.py
"""
AGENT-018: integration test for the agent_task step kind, end-to-end
through POST /v1/orchestrations/run — creates a throwaway plan with a
single agent_task step, monkeypatches AgentRuntime.run (so no real Groq
call is made), and asserts:
  - a successful agent run surfaces as a successful orchestration step
  - a needs_human_review run (AGENT-011 wiring) surfaces as a successful
    step whose output.status is 'needs_human_review', so downstream
    condition_expr steps can branch on it
  - the agent_task_runs row actually gets written to the DB

Requires a real, reachable DATABASE_URL — see
test_loan_noc_email_processing_e2e.py.

Also relies on the schemas.py fix that widens PlanStepCreate /
PlanStepResponse.input_bindings_json from Dict[str, str] to
Dict[str, Any] — as originally typed, creating any agent_task step
through POST /admin/plans (which needs prompt_ref/budgets/output_schema/
approval_policy as nested objects, not plain strings) would fail
Pydantic validation before this test even reaches the orchestrator.
"""
import os
os.environ.setdefault(
    "DATABASE_URL", "postgresql://orchestration:orchestration@localhost:5432/orchestration"
)

import pytest

from services.agent import agent_runtime as agent_runtime_module
from services.agent.agent_runtime import AgentRunResult


AGENT_TASK_PLAN = {
    "name": "test_agent_task_plan",
    "entity_type": "test",
    "error_policy": "best_effort",
    "max_concurrency": 4,
    "steps": [
        {
            "step_key": "run_agent",
            "step_order": 1,
            "kind": "agent_task",
            "datasource_name": "",
            "input_bindings_json": {
                "prompt_ref": {"prompt_id": "test-prompt"},
                "goal": "Summarize the customer's request",
                "allowed_tools": ["datasource_lookup"],
                "budgets": {"max_iterations": 3, "max_model_calls": 5, "max_tool_calls": 5,
                            "max_cost_usd": 1.0, "timeout_ms": 30000},
                "output_schema": {"type": "object", "required": ["summary"],
                                   "properties": {"summary": {"type": "string"}}},
                "approval_policy": {"mode": "auto_for_read_only", "require_approval_for": ["webhook"]},
            },
            "depends_on": [],
            "timeout_ms": 30000,
            "enabled": True,
        }
    ],
}


@pytest.fixture
def agent_task_plan(client):
    resp = client.post("/admin/plans", json=AGENT_TASK_PLAN)
    assert resp.status_code == 201, resp.text
    plan = resp.json()
    yield plan
    client.delete(f"/admin/plans/{plan['plan_id']}")


def _fake_run_result(status, output=None, error=None, evidence_extra=None):
    evidence = {"agent_run_id": "fake-run"}
    if evidence_extra:
        evidence.update(evidence_extra)
    return AgentRunResult(
        status=status,
        output=output or {},
        usage={"iterations_used": 1, "model_calls_used": 1, "tool_calls_used": 0, "cost_used_usd": 0.001},
        trace_summary=[],
        approvals=[],
        evidence=evidence,
        error=error,
    )


def test_agent_task_success(client, agent_task_plan, monkeypatch):
    def fake_run(self, config, context, agent_run_id):
        return _fake_run_result("success", output={"summary": "Customer wants an NOC letter."})

    monkeypatch.setattr(agent_runtime_module.AgentRuntime, "run", fake_run)

    resp = client.post("/v1/orchestrations/run", json={
        "plan_name": "test_agent_task_plan", "entity_type": "test",
        "tenant_id": "test-tenant", "params": {},
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "success"
    step_output = data["results"]["run_agent"]
    assert step_output["status"] == "success"
    assert step_output["output"]["summary"] == "Customer wants an NOC letter."

    steps_resp = client.get(f"/v1/orchestrations/runs/{data['execution_id']}/steps")
    assert steps_resp.status_code == 200
    step_rows = steps_resp.json()
    assert len(step_rows) == 1
    assert step_rows[0]["status"] == "success"


def test_agent_task_needs_human_review_surfaces_as_successful_step(client, agent_task_plan, monkeypatch):
    def fake_run(self, config, context, agent_run_id):
        return _fake_run_result(
            "needs_human_review",
            output={"summary": "low-confidence draft"},
            error="Evaluation score 0.4 below pass_threshold 0.8",
            evidence_extra={"evaluation": {"score": 0.4, "passed": False, "results": []}},
        )

    monkeypatch.setattr(agent_runtime_module.AgentRuntime, "run", fake_run)

    resp = client.post("/v1/orchestrations/run", json={
        "plan_name": "test_agent_task_plan", "entity_type": "test",
        "tenant_id": "test-tenant", "params": {},
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["status"] == "success"
    step_output = data["results"]["run_agent"]
    assert step_output["status"] == "needs_human_review"
    assert step_output["evaluation"]["score"] == 0.4


def test_agent_task_run_persisted_to_db(client, agent_task_plan, monkeypatch, db_conn):
    def fake_run(self, config, context, agent_run_id):
        return _fake_run_result("success", output={"summary": "ok"})

    monkeypatch.setattr(agent_runtime_module.AgentRuntime, "run", fake_run)

    resp = client.post("/v1/orchestrations/run", json={
        "plan_name": "test_agent_task_plan", "entity_type": "test",
        "tenant_id": "test-tenant", "params": {},
    })
    execution_id = resp.json()["execution_id"]

    cur = db_conn.cursor()
    cur.execute(
        "SELECT status, goal FROM orchestration.agent_task_runs WHERE execution_id = %s",
        (execution_id,),
    )
    row = cur.fetchone()
    db_conn.commit()
    assert row is not None
    assert row[0] == "success"
    assert row[1] == "Summarize the customer's request"