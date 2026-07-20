# orchestration/orchestration/services/plan_repository.py
import json
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from .db import execute, execute_one, execute_write, dict_cursor
from .schemas import PlanCreate, PlanUpdate, PlanStepCreate

logger = logging.getLogger(__name__)


def _row_to_plan(plan_row: dict, step_rows: list) -> dict:
    """Convert raw DB rows to a plan dict with steps."""
    plan = dict(plan_row)
    plan["steps"] = [dict(s) for s in step_rows]
    return plan


class PlanRepository:
    def __init__(self, conn):
        self.conn = conn

    # ── Get by name (used by /v1/360) ──────────────────────────────
    def get_plan(self, name: str, entity_type: str, tenant_id: str) -> dict:
        base_sql = """
            SELECT * FROM orchestration.plans
            WHERE name = %s
              AND entity_type = %s
              AND is_active = TRUE
        """
        plan = execute_one(self.conn,
            base_sql + " AND tenant_id = %s",
            (name, entity_type, tenant_id)
        )
        if not plan:
            plan = execute_one(self.conn,
                base_sql + " AND tenant_id IS NULL",
                (name, entity_type)
            )
        if not plan:
            plan = execute_one(self.conn,
                base_sql + " AND tenant_id = 'global'",
                (name, entity_type)
            )
        if not plan:
            plan = execute_one(self.conn,
                base_sql + " AND tenant_id = ''",
                (name, entity_type)
            )
        if not plan:
            raise ValueError(
                f"Plan '{name}' (entity_type={entity_type}) not found or inactive"
            )
        steps = execute(self.conn,
            "SELECT * FROM orchestration.plan_steps WHERE plan_id = %s ORDER BY step_order",
            (str(plan["plan_id"]),)
        )
        return _row_to_plan(plan, steps)

    # ── Get by ID ──────────────────────────────────────────────────
    def get_plan_by_id(self, plan_id: UUID) -> Optional[dict]:
        plan = execute_one(self.conn,
            "SELECT * FROM orchestration.plans WHERE plan_id = %s",
            (str(plan_id),)
        )
        if not plan:
            return None
        steps = execute(self.conn,
            "SELECT * FROM orchestration.plan_steps WHERE plan_id = %s ORDER BY step_order",
            (str(plan_id),)
        )
        return _row_to_plan(plan, steps)

    # ── List all ───────────────────────────────────────────────────
    def list_plans(self) -> list[dict]:
        plans = execute(self.conn,
            "SELECT * FROM orchestration.plans ORDER BY created_at DESC"
        )
        result = []
        for plan in plans:
            steps = execute(self.conn,
                "SELECT * FROM orchestration.plan_steps WHERE plan_id = %s ORDER BY step_order",
                (str(plan["plan_id"]),)
            )
            result.append(_row_to_plan(plan, steps))
        return result

    # ── Create ─────────────────────────────────────────────────────
    def create_plan(self, payload: PlanCreate, created_by: str) -> dict:
        plan_id = str(uuid4())
        execute_write(self.conn, """
            INSERT INTO orchestration.plans
                (plan_id, name, entity_type, description, tenant_id,
                 error_policy, max_concurrency, created_by, is_active, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, 1)
        """, (
            plan_id,
            payload.name,
            payload.entity_type,
            payload.description,
            payload.tenant_id,
            payload.error_policy,
            payload.max_concurrency,
            created_by,
        ))
        self._insert_steps(plan_id, payload.steps)
        self.conn.commit()
        return self.get_plan_by_id(UUID(plan_id))

    # ── Update ─────────────────────────────────────────────────────
    def update_plan(self, plan_id: UUID, payload: PlanUpdate) -> Optional[dict]:
        plan = self.get_plan_by_id(plan_id)
        if not plan:
            return None

        fields = []
        values = []

        if payload.name is not None:
            fields.append("name = %s")
            values.append(payload.name)
        if payload.entity_type is not None:
            fields.append("entity_type = %s")
            values.append(payload.entity_type)
        if payload.description is not None:
            fields.append("description = %s")
            values.append(payload.description)
        if payload.tenant_id is not None:
            fields.append("tenant_id = %s")
            values.append(payload.tenant_id)
        if payload.error_policy is not None:
            fields.append("error_policy = %s")
            values.append(payload.error_policy)
        if payload.max_concurrency is not None:
            fields.append("max_concurrency = %s")
            values.append(payload.max_concurrency)

        fields.append("version = version + 1")
        fields.append("updated_at = NOW()")
        values.append(str(plan_id))

        execute_write(self.conn,
            f"UPDATE orchestration.plans SET {', '.join(fields)} WHERE plan_id = %s",
            values
        )

        if payload.steps is not None:
            execute_write(self.conn,
                "DELETE FROM orchestration.plan_steps WHERE plan_id = %s",
                (str(plan_id),)
            )
            self._insert_steps(str(plan_id), payload.steps)

        self.conn.commit()
        return self.get_plan_by_id(plan_id)

    # ── Delete ─────────────────────────────────────────────────────
    def delete_plan(self, plan_id: UUID) -> bool:
        plan = self.get_plan_by_id(plan_id)
        if not plan:
            return False
        execute_write(self.conn,
            "DELETE FROM orchestration.plans WHERE plan_id = %s",
            (str(plan_id),)
        )
        self.conn.commit()
        return True

    # ── Deactivate ─────────────────────────────────────────────────
    def deactivate_plan(self, plan_id: UUID) -> Optional[dict]:
        plan = self.get_plan_by_id(plan_id)
        if not plan:
            return None
        execute_write(self.conn,
            "UPDATE orchestration.plans SET is_active = FALSE, updated_at = NOW() WHERE plan_id = %s",
            (str(plan_id),)
        )
        self.conn.commit()
        return self.get_plan_by_id(plan_id)

    # ── Activate ───────────────────────────────────────────────────
    def activate_plan(self, plan_id: UUID) -> Optional[dict]:
        plan = self.get_plan_by_id(plan_id)
        if not plan:
            return None
        execute_write(self.conn,
            "UPDATE orchestration.plans SET is_active = TRUE, updated_at = NOW() WHERE plan_id = %s",
            (str(plan_id),)
        )
        self.conn.commit()
        return self.get_plan_by_id(plan_id)

    # ── Clone ──────────────────────────────────────────────────────
    def clone_plan(self, plan_id: UUID, new_name: str, created_by: str) -> Optional[dict]:
        original = self.get_plan_by_id(plan_id)
        if not original:
            return None

        clone_id = str(uuid4())
        execute_write(self.conn, """
            INSERT INTO orchestration.plans
                (plan_id, name, entity_type, description, tenant_id,
                 error_policy, max_concurrency, created_by, is_active, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, 1)
        """, (
            clone_id,
            new_name,
            original["entity_type"],
            f"Copy of: {original.get('description') or original['name']}",
            original.get("tenant_id"),
            original["error_policy"],
            original["max_concurrency"],
            created_by,
        ))

        # Clone steps
        for step in original["steps"]:
            step_id = str(uuid4())
            execute_write(self.conn, """
                INSERT INTO orchestration.plan_steps
                    (plan_step_id, plan_id, step_key, step_order, kind,
                     datasource_name, sql_template, method, path_template,
                     query_params_json, body_json, graphql_query_template,
                     graphql_vars_json, ai_prompt_template, ai_output_schema,
                     depends_on, condition_expr, input_bindings_json,
                     timeout_ms, enabled)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                step_id, clone_id,
                step["step_key"], step["step_order"], step["kind"],
                step["datasource_name"], step.get("sql_template"),
                step.get("method"), step.get("path_template"),
                json.dumps(step.get("query_params_json") or {}),
                json.dumps(step.get("body_json")) if step.get("body_json") else None,
                step.get("graphql_query_template"),
                json.dumps(step.get("graphql_vars_json")) if step.get("graphql_vars_json") else None,
                step.get("ai_prompt_template"),
                json.dumps(step.get("ai_output_schema")) if step.get("ai_output_schema") else None,
                step.get("depends_on") or [],
                step.get("condition_expr"),
                json.dumps(step.get("input_bindings_json") or {}),
                step.get("timeout_ms") or 5000,
                step.get("enabled", True),
            ))

        self.conn.commit()
        return self.get_plan_by_id(UUID(clone_id))

    # ── Private: insert steps ──────────────────────────────────────
    def _insert_steps(self, plan_id: str, steps: list[PlanStepCreate]) -> None:
        for step in steps:
            execute_write(self.conn, """
                INSERT INTO orchestration.plan_steps
                    (plan_step_id, plan_id, step_key, step_order, kind,
                     datasource_name, sql_template, method, path_template,
                     query_params_json, body_json, graphql_query_template,
                     graphql_vars_json, ai_prompt_template, ai_output_schema,
                     depends_on, condition_expr, input_bindings_json,
                     timeout_ms, enabled)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                str(uuid4()), plan_id,
                step.step_key,
                step.step_order,
                step.kind,
                step.datasource_name,
                step.sql_template,
                step.method,
                step.path_template,
                json.dumps(step.query_params_json or {}),
                json.dumps(step.body_json) if step.body_json else None,
                step.graphql_query_template,
                json.dumps(step.graphql_vars_json) if step.graphql_vars_json else None,
                step.ai_prompt_template,
                json.dumps(step.ai_output_schema) if step.ai_output_schema else None,
                step.depends_on or [],
                step.condition_expr,
                json.dumps(step.input_bindings_json or {}),
                step.timeout_ms or 5000,
                step.enabled if step.enabled is not None else True,
            ))