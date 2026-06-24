from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import structlog
from app.core.logging import setup_logging
from app.core.middleware import TraceIdMiddleware

setup_logging()
logger = structlog.get_logger()

app = FastAPI(title="CloudForge AI Engine", version="1.0.0")
app.add_middleware(TraceIdMiddleware)

class GenerateRequest(BaseModel):
    prompt: str
    job_id: str

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

@app.post("/generate")
async def generate(req: GenerateRequest = Body(...)):
    # Bind job_id to structured logs
    structlog.contextvars.bind_contextvars(job_id=req.job_id)
    logger.info("Triggering mock multi-agent generation pipeline", prompt=req.prompt)

    # Return mock payloads satisfying schemas in packages/shared-types/src/schemas.ts
    mock_plan = {
        "schema_version": "1.0",
        "prompt_version": "planner/v1",
        "model_name": "claude-sonnet-4-6",
        "provider_name": "anthropic",
        "generated_at": datetime.utcnow().isoformat(),
        "system_name": "Mock Architecture Plan",
        "scale_tier": "medium",
        "primary_use_case": "E-commerce Platform",
        "assumed_user_count": 50000,
        "assumed_peak_rps": 200,
        "assumed_regions": ["us-east-1"],
        "key_assumptions": ["Web traffic only", "Greenfield deployment"],
        "out_of_scope": ["Data migration", "External API integrations"],
        "execution_phases": ["Design", "Infrastructure Scaffolding", "Review"],
        "critical_constraints": ["Monthly cost < $200"],
        "injection_detected": False
    }

    mock_architecture = {
        "schema_version": "1.0",
        "prompt_version": "architecture/v1",
        "model_name": "claude-sonnet-4-6",
        "provider_name": "anthropic",
        "generated_at": datetime.utcnow().isoformat(),
        "architecture_pattern": "Modular Monolith",
        "components": [
            {
                "name": "API Service",
                "responsibility": "Handle HTTP requests",
                "technology": "Node.js/Express",
                "scales_horizontally": True,
                "single_point_of_failure": False
            }
        ],
        "database_primary": "PostgreSQL",
        "database_replica_strategy": "Single read replica",
        "caching_layer": "Redis",
        "message_queue": None,
        "cdn_required": True,
        "ha_strategy": "Multi-AZ",
        "dr_rto_minutes": 60,
        "dr_rpo_minutes": 15,
        "identified_spofs": [],
        "architecture_decisions": ["Used PostgreSQL for ACID compliance"]
    }

    mock_aws_architecture = {
        "schema_version": "1.0",
        "prompt_version": "aws-expert/v1",
        "model_name": "claude-sonnet-4-6",
        "provider_name": "anthropic",
        "generated_at": datetime.utcnow().isoformat(),
        "primary_region": "us-east-1",
        "secondary_region": None,
        "vpc_design": "3 private subnets, 3 public subnets",
        "services": [
            {
                "service_name": "Amazon ECS",
                "purpose": "Run API container",
                "configuration": "Fargate, 0.5 vCPU, 1 GB RAM",
                "alternatives_considered": ["AWS App Runner"],
                "justification": "Better control over VPC routing"
            }
        ],
        "networking_topology": "ALB routes to ECS tasks inside private subnets",
        "load_balancer_type": "Application Load Balancer",
        "auto_scaling_strategy": "Target tracking scaling at 70% CPU",
        "backup_strategy": "AWS Backup daily snapshots",
        "aws_well_architected_notes": ["Security group rules restricted to ALB"]
    }

    return {
        "job_id": req.job_id,
        "status": "COMPLETE",
        "artifacts": {
            "PLAN": mock_plan,
            "ARCHITECTURE": mock_architecture,
            "AWS_ARCHITECTURE": mock_aws_architecture
        }
    }
