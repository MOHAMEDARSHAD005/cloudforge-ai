import asyncio
import time
from datetime import datetime
import structlog
from app.agents import run_planner, run_architecture, run_aws_expert
from app.orchestrator.callbacks import send_nestjs_callback
from app.orchestrator.idempotency import get_existing_artifact
from app.models import ProjectPlan, ArchitectureModel, AwsArchitecture

logger = structlog.get_logger()

def populate_provenance(artifact, prompt_version: str, model_name: str = "claude-sonnet-4-6"):
    artifact.schema_version = "1.0"
    artifact.prompt_version = prompt_version
    artifact.model_name = model_name
    artifact.provider_name = "anthropic"
    artifact.generated_at = datetime.utcnow()

async def run_pipeline(job_id: str, requirement: str, trace_id: str = None) -> dict:
    logger.info("pipeline_started", job_id=job_id, trace_id=trace_id)
    
    # -------------------------------------------------------------
    # Wave 1: Planner Agent (Sequential)
    # -------------------------------------------------------------
    planner_cached = await get_existing_artifact(job_id, "PLAN", trace_id=trace_id)
    if planner_cached:
        logger.info("planner_cache_hit_in_pipeline", job_id=job_id)
        plan = ProjectPlan.model_validate(planner_cached)
    else:
        await send_nestjs_callback(job_id, {"event": "agent:started", "agent": "planner"}, trace_id=trace_id)
        start_time = time.time()
        try:
            plan, usage = await run_planner(requirement, trace_id=trace_id)
            duration_ms = int((time.time() - start_time) * 1000)
            populate_provenance(plan, "planner/v1")
            
            await send_nestjs_callback(job_id, {
                "event": "agent:complete",
                "agent": "planner",
                "durationMs": duration_ms,
                "tokenUsage": {"input": usage.input_tokens, "output": usage.output_tokens},
                "payload": plan.model_dump(mode="json")
            }, trace_id=trace_id)
        except Exception as e:
            await send_nestjs_callback(job_id, {
                "event": "agent:failed",
                "agent": "planner",
                "error": str(e),
                "fatal": True
            }, trace_id=trace_id)
            raise

    # -------------------------------------------------------------
    # Wave 2: Architecture & AWS Expert Agents (Parallel)
    # -------------------------------------------------------------
    
    async def execute_architecture():
        arch_cached = await get_existing_artifact(job_id, "ARCHITECTURE", trace_id=trace_id)
        if arch_cached:
            logger.info("architecture_cache_hit_in_pipeline", job_id=job_id)
            return ArchitectureModel.model_validate(arch_cached)
            
        await send_nestjs_callback(job_id, {"event": "agent:started", "agent": "architecture"}, trace_id=trace_id)
        start_time = time.time()
        try:
            arch, usage = await run_architecture(plan, trace_id=trace_id)
            duration_ms = int((time.time() - start_time) * 1000)
            populate_provenance(arch, "architecture/v1")
            
            await send_nestjs_callback(job_id, {
                "event": "agent:complete",
                "agent": "architecture",
                "durationMs": duration_ms,
                "tokenUsage": {"input": usage.input_tokens, "output": usage.output_tokens},
                "payload": arch.model_dump(mode="json")
            }, trace_id=trace_id)
            return arch
        except Exception as e:
            await send_nestjs_callback(job_id, {
                "event": "agent:failed",
                "agent": "architecture",
                "error": str(e),
                "fatal": True
            }, trace_id=trace_id)
            raise

    async def execute_aws_expert():
        aws_cached = await get_existing_artifact(job_id, "AWS_ARCHITECTURE", trace_id=trace_id)
        if aws_cached:
            logger.info("aws_expert_cache_hit_in_pipeline", job_id=job_id)
            return AwsArchitecture.model_validate(aws_cached)
            
        await send_nestjs_callback(job_id, {"event": "agent:started", "agent": "aws_expert"}, trace_id=trace_id)
        start_time = time.time()
        try:
            aws, usage = await run_aws_expert(plan, trace_id=trace_id)
            duration_ms = int((time.time() - start_time) * 1000)
            populate_provenance(aws, "aws-expert/v1")
            
            await send_nestjs_callback(job_id, {
                "event": "agent:complete",
                "agent": "aws_expert",
                "durationMs": duration_ms,
                "tokenUsage": {"input": usage.input_tokens, "output": usage.output_tokens},
                "payload": aws.model_dump(mode="json")
            }, trace_id=trace_id)
            return aws
        except Exception as e:
            await send_nestjs_callback(job_id, {
                "event": "agent:failed",
                "agent": "aws_expert",
                "error": str(e),
                "fatal": True
            }, trace_id=trace_id)
            raise

    # Run in parallel using asyncio.gather
    arch, aws = await asyncio.gather(execute_architecture(), execute_aws_expert())
    
    logger.info("pipeline_completed", job_id=job_id, trace_id=trace_id)
    return {
        "PLAN": plan,
        "ARCHITECTURE": arch,
        "AWS_ARCHITECTURE": aws
    }
