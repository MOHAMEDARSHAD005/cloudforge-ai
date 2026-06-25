import os
import httpx
import structlog

logger = structlog.get_logger()

INTERNAL_API_URL = os.getenv("INTERNAL_API_URL", "http://localhost:3000")
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "mock-internal-secret-123")

async def get_existing_artifact(job_id: str, artifact_type: str, trace_id: str = None) -> dict | None:
    url = f"{INTERNAL_API_URL}/api/v1/artifacts/internal/job/{job_id}/type/{artifact_type}"
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
