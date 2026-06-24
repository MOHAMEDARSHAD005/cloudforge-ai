import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

logger = structlog.get_logger()

class TraceIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        trace_header = request.headers.get("x-trace-id") or request.headers.get("X-Trace-Id")
        trace_id = trace_header or str(uuid.uuid4())
        
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            trace_id=trace_id,
            service="ai-fastapi",
            environment="development"
        )
        
        response = await call_next(request)
        response.headers["X-Trace-Id"] = trace_id
        return response
