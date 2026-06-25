import os
import re
import urllib.parse
import httpx
import structlog
from app.core.config import INTERNAL_API_URL

logger = structlog.get_logger()

INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "mock-internal-secret-123")

JOB_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]+$")

def validate_job_id(job_id: str) -> None:
    if not job_id or not JOB_ID_REGEX.match(job_id):
        raise ValueError(f"Invalid job ID format: {job_id}")

async def send_nestjs_callback(job_id: str, event_payload: dict, trace_id: str = None) -> bool:
    validate_job_id(job_id)
    encoded_job_id = urllib.parse.quote(job_id)
    url = f"{INTERNAL_API_URL}/api/v1/jobs/{encoded_job_id}/events"
    headers = {
        "X-Internal-Token": INTERNAL_API_SECRET,
        "X-Trace-Id": trace_id or "",
        "Content-Type": "application/json"
    }
    
    logger.info("sending_nestjs_callback", job_id=job_id, cb_event=event_payload.get("event"), url=url, trace_id=trace_id)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=event_payload, headers=headers)
            # Accept any 2xx status code
            if 200 <= response.status_code < 300:
                logger.info("nestjs_callback_success", job_id=job_id, cb_event=event_payload.get("event"))
                return True
            else:
                logger.error(
                    "nestjs_callback_failed_status",
                    job_id=job_id,
                    status_code=response.status_code,
                    body=response.text
                )
                return False
    except Exception as e:
        logger.error("nestjs_callback_connection_error", job_id=job_id, error=str(e))
        return False
