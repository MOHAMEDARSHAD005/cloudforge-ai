import os
from fastapi import FastAPI, Body, Header, HTTPException, status, Depends
from pydantic import BaseModel
from datetime import datetime
import structlog
from app.core.logger import setup_logging
from app.core.middleware import TraceIdMiddleware
from app.orchestrator.waves import run_pipeline

setup_logging()
logger = structlog.get_logger()

app = FastAPI(title="CloudForge AI Engine", version="1.0.0")
app.add_middleware(TraceIdMiddleware)

class GenerateRequest(BaseModel):
    prompt: str
    job_id: str

async def verify_internal_token(x_internal_token: str = Header(None, alias="X-Internal-Token")):
    expected_token = os.getenv("INTERNAL_API_SECRET", "mock-internal-secret-123")
    if not x_internal_token or x_internal_token != expected_token:
        logger.warn("unauthorized_internal_access_attempt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal service token"
        )

@app.on_event("startup")
async def startup_event():
    logger.info("ai-fastapi service started and ready")

@app.get("/health")
async def health():
    logger.info("Health check endpoint called")
    return {"status": "ok", "service": "ai-fastapi", "timestamp": datetime.utcnow().isoformat()}

@app.get("/agents")
async def get_agents():
    logger.info("Listing agent configurations")
    return {
        "agents": {
            "planner": {"version": "v1", "model": "claude-sonnet-4-6"},
            "architecture": {"version": "v1", "model": "claude-sonnet-4-6"},
            "awsExpert": {"version": "v1", "model": "claude-sonnet-4-6"},
            "security": {"version": "v1", "model": "claude-sonnet-4-6"},
            "cost": {"version": "v1", "model": "claude-sonnet-4-6"},
            "terraform": {"version": "v1", "model": "claude-sonnet-4-6"},
            "diagram": {"version": "v1", "model": "claude-haiku-4-5"},
            "reviewer": {"version": "v1", "model": "claude-sonnet-4-6"},
        }
    }

@app.post("/generate", dependencies=[Depends(verify_internal_token)])
async def generate(
    req: GenerateRequest = Body(...),
    x_trace_id: str = Header(None, alias="X-Trace-Id")
):
    structlog.contextvars.bind_contextvars(job_id=req.job_id)
    logger.info("Triggering real multi-agent generation pipeline", prompt=req.prompt, trace_id=x_trace_id)
    
    try:
        artifacts = await run_pipeline(req.job_id, req.prompt, trace_id=x_trace_id)
        return {
            "job_id": req.job_id,
            "status": "COMPLETE",
            "artifacts": {
                "PLAN": artifacts["PLAN"].model_dump(mode="json"),
                "ARCHITECTURE": artifacts["ARCHITECTURE"].model_dump(mode="json"),
                "AWS_ARCHITECTURE": artifacts["AWS_ARCHITECTURE"].model_dump(mode="json")
            }
        }
    except Exception as e:
        logger.error("pipeline_execution_error", error=str(e), trace_id=x_trace_id)
        # Re-raise the exception or return a structured HTTP 500 error
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline execution failed: {str(e)}"
        )
