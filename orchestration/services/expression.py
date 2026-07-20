# orchestration/service/expression.py
import re
from typing import Any, Dict

from asteval import Interpreter


class ExprError(Exception):
    pass


def _eval_path(path: str, ctx: Dict[str, Any]) -> Any:
    cur: Any = ctx
    for segment in path.split("."):
        if "[" in segment and segment.endswith("]"):
            name, idx_part = segment.split("[", 1)
            idx = int(idx_part[:-1])
            cur = cur.get(name, [])
            try:
                cur = cur[idx]
            except (IndexError, TypeError):
                return None
        else:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(segment)
        if cur is None:
            return None
    return cur


def eval_expr(expr: str, context: Dict[str, Any]) -> Any:
    """
    Supports:
      - dotted paths: results.crm.contact.email
      - fallbacks: a or b
    """
    parts = [p.strip() for p in expr.split(" or ")]
    for part in parts:
        val = _eval_path(part, context)
        if val not in (None, "", []):
            return val
    return None


def eval_bindings(bindings: Dict[str, str], context: Dict[str, Any]) -> Dict[str, Any]:
    return {k: eval_expr(v, context) for k, v in bindings.items()}


# Matches dotted attribute-style paths rooted at "params." or "results.",
# e.g. results.route_policy.routing_decision or params.tenant_id
_DOTTED_PATH_RE = re.compile(
    r"\b(params|results)((?:\.[A-Za-z_][A-Za-z0-9_]*)+)\b"
)


def _rewrite_dotted_paths(expr: str) -> str:
    """
    condition_expr is written using dot notation against plain dicts
    (results.route_policy.routing_decision == 'AUTO_PROCESS'), which
    asteval cannot resolve directly since dicts have no attribute access.
    Rewrite params.x.y / results.x.y into params['x']['y'] / results['x']['y']
    before evaluation, so the documented dot-notation syntax actually works.
    Bracket notation (results['x']['y']) and indexed access
    (results.items[0]) continue to work unchanged — this only rewrites
    matches that look like plain dotted attribute chains.
    """
    def _replace(match: "re.Match[str]") -> str:
        root = match.group(1)
        rest = match.group(2)
        segments = [s for s in rest.split(".") if s]
        bracketed = "".join(f"['{s}']" for s in segments)
        return f"{root}{bracketed}"

    return _DOTTED_PATH_RE.sub(_replace, expr)


def eval_condition(expr: str, context: Dict[str, Any]) -> bool:
    """
    Safely evaluate a limited boolean expression, with only
    'params' and 'results' available, using asteval with disabled builtins.
    Example:
        results.billing.summary.total_overdue > 0 and params.segment != "VIP"
    """
    if not expr:
        return True

    symtable = {
        "params": context.get("params", {}),
        "results": context.get("results", {}),
    }

    aeval = Interpreter(
        symtable=symtable,
        minimal=True,
        usersyms={},  # do not allow user-defined functions
    )
    try:
        rewritten = _rewrite_dotted_paths(expr)
        val = aeval(rewritten)
        if aeval.error:
            return False
        return bool(val)
    except Exception:
        # safest failure mode: treat as False (condition not met)
        return False