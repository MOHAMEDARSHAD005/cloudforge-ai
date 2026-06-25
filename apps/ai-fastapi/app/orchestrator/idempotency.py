import os
import re
import urllib.parse
import httpx
import structlog
from app.core.config import INTERNAL_API_URL

logger = structlog.get_logger()

INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "mock-internal-secret-123")

JOB_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]+$")
ALLOWED_ARTIFACT_TYPES = {"PLAN", "ARCHITECTURE", "AWS_ARCHITECTURE", "SECURITY", "COST", "TERRAFORM", "DIAGRAM", "REVIEW"}

def validate_job_id(job_id: str) -> None:
    if not job_id or not JOB_ID_REGEX.match(job_id):
        raise ValueError(f"Invalid job ID format: {job_id}")

def validate_artifact_type(artifact_type: str) -> None:
    if artifact_type not in ALLOWED_ARTIFACT_TYPES:
        raise ValueError(f"Invalid artifact type: {artifact_type}")

async def get_existing_artifact(job_id: str, artifact_type: str, trace_id: str = None) -> dict | None:
    if not re.match(r"^[a-zA-Z0-9_\-]+$", job_id):
        raise ValueError("Invalid job ID format")
    if artifact_type not in {"PLAN", "ARCHITECTURE", "AWS_ARCHITECTURE", "SECURITY", "COST", "TERRAFORM", "DIAGRAM", "REVIEW"}:
        raise ValueError("Invalid artifact type")
    encoded_job_id = urllib.parse.quote(job_id, safe="")
    encoded_artifact_type = urllib.parse.quote(artifact_type, safe="")
    url = f"{INTERNAL_API_URL}/api/v1/artifacts/internal/job/{encoded_job_id}/type/{encoded_artifact_type}"
    headers = {
        "X-Internal-Token": INTERNAL_API_SECRET,
        "X-Trace-Id": trace_id or ""
    }
    
    logger.info("checking_existing_artifact", job_id=job_id, type=artifact_type, trace_id=trace_id)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                logger.info("artifact_cache_hit", job_id=job_id, type=artifact_type)
                return data.get("payload")
            elif response.status_code == 404:
                logger.info("artifact_cache_miss", job_id=job_id, type=artifact_type)
                return None
            else:
                logger.warn(
                    "artifact_cache_check_error_status",
                    job_id=job_id,
                    type=artifact_type,
                    status_code=response.status_code
                )
                return None
    except Exception as e:
        logger.error("artifact_cache_check_connection_error", job_id=job_id, type=artifact_type, error=str(e))
        return None
