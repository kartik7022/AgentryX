# orchestration/service/logging_middleware.py
import logging
import time
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("orchestration")


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        start = time.time()
        path = request.url.path
        method = request.method
        corr_id = request.headers.get("X-Correlation-Id", "")
        tenant = request.headers.get("X-Tenant-Context", "")

        logger.info(
            "request start",
            extra={"path": path, "method": method, "correlation_id": corr_id},
        )
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.exception(
                "request error",
                extra={
                    "path": path,
                    "method": method,
                    "correlation_id": corr_id,
                    "tenant_context": tenant,
                },
            )
            raise

        duration = time.time() - start
        logger.info(
            "request end",
            extra={
                "path": path,
                "method": method,
                "status_code": response.status_code,
                "correlation_id": corr_id,
                "duration_ms": int(duration * 1000),
            },
        )
        return response
