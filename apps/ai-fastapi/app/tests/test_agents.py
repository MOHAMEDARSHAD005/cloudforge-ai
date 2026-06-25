import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from pydantic import BaseModel, ValidationError
from pydantic_ai import RunUsage

from app.orchestrator.token_accounting import calculate_cost
from app.core.prompts import load_agent_prompt
from app.core.retry import run_agent_with_retry, FatalAgentError
from app.agents.planner import run_planner, planner_agent
from app.agents.architecture import run_architecture, architecture_agent
from app.agents.aws_expert import run_aws_expert, aws_expert_agent
from app.orchestrator.waves import run_pipeline
from app.models.planner import ProjectPlan
from app.models.architecture import ArchitectureModel
from app.models.aws_expert import AwsArchitecture

class DummyModel(BaseModel):
    name: str

def get_validation_error():
    try:
        DummyModel(name=[1, 2])
    except ValidationError as e:
        return e

class MockRunResult:
    def __init__(self, output, input_tokens=10, output_tokens=20):
        self.output = output
        self.usage = RunUsage(input_tokens=input_tokens, output_tokens=output_tokens)

def test_calculate_cost():
    sonnet_cost = calculate_cost("claude-sonnet-4-6", 1000, 2000)
    assert abs(sonnet_cost - 0.033) < 1e-6

    haiku_cost = calculate_cost("claude-haiku-4-5", 1000, 2000)
    assert abs(haiku_cost - 0.0088) < 1e-6

def test_load_prompt_template():
    try:
        content = load_agent_prompt("planner", "v1")
        assert len(content) > 0
    except FileNotFoundError:
        pytest.fail("Planner prompt template not found")

@pytest.mark.asyncio
async def test_planner_retries_on_validation_error():
    call_count = 0
    valid_plan = ProjectPlan(
        schema_version="1.0",
        prompt_version="planner/v1",
        model_name="claude-sonnet-4-6",
        provider_name="anthropic",
        generated_at="2026-06-25T12:00:00Z",
        system_name="Test ERP",
        scale_tier="enterprise",
        primary_use_case="ERP",
        assumed_user_count=50000,
        assumed_peak_rps=100,
        assumed_regions=["us-east-1"],
        key_assumptions=["scaling limit"],
        out_of_scope=["auth"],
        execution_phases=["Phase 1"],
        critical_constraints=["Latency"],
        injection_detected=False
    )

    async def mock_run(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise get_validation_error()
        return MockRunResult(valid_plan)

    with patch.object(planner_agent, 'run', new_callable=AsyncMock) as mock_agent_run:
        mock_agent_run.side_effect = mock_run
        
        plan, usage = await run_planner("Build a school ERP for 50,000 users")
        
        assert call_count == 2
        assert plan.system_name == "Test ERP"
        assert usage.input_tokens == 10

@pytest.mark.asyncio
async def test_architecture_agent_returns_valid_model():
    valid_arch = ArchitectureModel(
        schema_version="1.0",
        prompt_version="architecture/v1",
        model_name="claude-sonnet-4-6",
        provider_name="anthropic",
        generated_at="2026-06-25T12:00:00Z",
        architecture_pattern="microservices",
        components=[],
        database_primary="rds postgres",
        database_replica_strategy="read replica",
        caching_layer="redis",
        message_queue="rabbitmq",
        cdn_required=True,
        ha_strategy="multi-az",
        dr_rto_minutes=15,
        dr_rpo_minutes=5,
        identified_spofs=["none"],
        architecture_decisions=["use redis"]
    )

    plan = ProjectPlan(
        schema_version="1.0",
        prompt_version="planner/v1",
        model_name="claude-sonnet-4-6",
        provider_name="anthropic",
        generated_at="2026-06-25T12:00:00Z",
        system_name="Test ERP",
        scale_tier="enterprise",
        primary_use_case="ERP",
        assumed_user_count=50000,
        assumed_peak_rps=100,
        assumed_regions=["us-east-1"],
        key_assumptions=["scaling limit"],
        out_of_scope=["auth"],
        execution_phases=["Phase 1"],
        critical_constraints=["Latency"],
        injection_detected=False
    )

    with patch.object(architecture_agent, 'run', new_callable=AsyncMock) as mock_run:
        mock_run.return_value = MockRunResult(valid_arch)
        arch, usage = await run_architecture(plan)
        assert arch.architecture_pattern == "microservices"
        mock_run.assert_called_once()

@pytest.mark.asyncio
async def test_aws_expert_agent_returns_valid_model():
    valid_aws = AwsArchitecture(
        schema_version="1.0",
        prompt_version="aws-expert/v1",
        model_name="claude-sonnet-4-6",
        provider_name="anthropic",
        generated_at="2026-06-25T12:00:00Z",
        primary_region="us-east-1",
        secondary_region=None,
        vpc_design="three-tier",
        services=[],
        networking_topology="transit gateway",
        load_balancer_type="alb",
        auto_scaling_strategy="cpu metrics",
        backup_strategy="daily snapshots",
        aws_well_architected_notes=[]
    )

    plan = ProjectPlan(
        schema_version="1.0",
        prompt_version="planner/v1",
        model_name="claude-sonnet-4-6",
        provider_name="anthropic",
        generated_at="2026-06-25T12:00:00Z",
        system_name="Test ERP",
        scale_tier="enterprise",
        primary_use_case="ERP",
        assumed_user_count=50000,
        assumed_peak_rps=100,
        assumed_regions=["us-east-1"],
        key_assumptions=["scaling limit"],
        out_of_scope=["auth"],
        execution_phases=["Phase 1"],
        critical_constraints=["Latency"],
        injection_detected=False
    )

    with patch.object(aws_expert_agent, 'run', new_callable=AsyncMock) as mock_run:
        mock_run.return_value = MockRunResult(valid_aws)
        aws, usage = await run_aws_expert(plan)
        assert aws.vpc_design == "three-tier"
        mock_run.assert_called_once()

@pytest.mark.asyncio
async def test_wave_2_runs_in_parallel():
    with patch('app.orchestrator.waves.run_planner', new_callable=AsyncMock) as mock_plan, \
         patch('app.orchestrator.waves.run_architecture', new_callable=AsyncMock) as mock_arch, \
         patch('app.orchestrator.waves.run_aws_expert', new_callable=AsyncMock) as mock_aws, \
         patch('app.orchestrator.waves.send_nestjs_callback', new_callable=AsyncMock) as mock_callback, \
         patch('app.orchestrator.waves.get_existing_artifact', new_callable=AsyncMock) as mock_cache:
         
         mock_cache.return_value = None
         
         plan = ProjectPlan(
            schema_version="1.0",
            prompt_version="planner/v1",
            model_name="claude-sonnet-4-6",
            provider_name="anthropic",
            generated_at="2026-06-25T12:00:00Z",
            system_name="Test ERP",
            scale_tier="enterprise",
            primary_use_case="ERP",
            assumed_user_count=50000,
            assumed_peak_rps=100,
            assumed_regions=["us-east-1"],
            key_assumptions=["scaling limit"],
            out_of_scope=["auth"],
            execution_phases=["Phase 1"],
            critical_constraints=["Latency"],
            injection_detected=False
          )
         mock_plan.return_value = (plan, RunUsage(input_tokens=10, output_tokens=10))

         arch = ArchitectureModel(
            schema_version="1.0",
            prompt_version="architecture/v1",
            model_name="claude-sonnet-4-6",
            provider_name="anthropic",
            generated_at="2026-06-25T12:00:00Z",
            architecture_pattern="microservices",
            components=[],
            database_primary="rds postgres",
            database_replica_strategy="read replica",
            caching_layer="redis",
            message_queue="rabbitmq",
            cdn_required=True,
            ha_strategy="multi-az",
            dr_rto_minutes=15,
            dr_rpo_minutes=5,
            identified_spofs=["none"],
            architecture_decisions=["use redis"]
         )
         mock_arch.return_value = (arch, RunUsage(input_tokens=10, output_tokens=10))

         aws = AwsArchitecture(
            schema_version="1.0",
            prompt_version="aws-expert/v1",
            model_name="claude-sonnet-4-6",
            provider_name="anthropic",
            generated_at="2026-06-25T12:00:00Z",
            primary_region="us-east-1",
            secondary_region=None,
            vpc_design="three-tier",
            services=[],
            networking_topology="transit gateway",
            load_balancer_type="alb",
            auto_scaling_strategy="cpu metrics",
            backup_strategy="daily snapshots",
            aws_well_architected_notes=[]
         )
         mock_aws.return_value = (aws, RunUsage(input_tokens=10, output_tokens=10))

         result = await run_pipeline("job-123", "Build a school ERP for 50,000 users")
         
         assert result["PLAN"] == plan
         assert result["ARCHITECTURE"] == arch
         assert result["AWS_ARCHITECTURE"] == aws
         
         mock_plan.assert_called_once()
         mock_arch.assert_called_once()
         mock_aws.assert_called_once()

@pytest.mark.asyncio
async def test_fatal_agent_failure_raises_after_max_retries():
    async def mock_run(*args, **kwargs):
        raise get_validation_error()

    with patch.object(planner_agent, 'run', new_callable=AsyncMock) as mock_agent_run:
        mock_agent_run.side_effect = mock_run
        
        with pytest.raises(FatalAgentError) as excinfo:
            await run_planner("Build a school ERP for 50,000 users")
        
        assert "planner" in excinfo.value.agent
        assert mock_agent_run.call_count == 3

@pytest.mark.asyncio
async def test_idempotency_returns_cached_artifact_without_llm_call():
    cached_plan = {
        "schema_version": "1.0",
        "prompt_version": "planner/v1",
        "model_name": "claude-sonnet-4-6",
        "provider_name": "anthropic",
        "generated_at": "2026-06-25T12:00:00Z",
        "system_name": "Cached ERP",
        "scale_tier": "enterprise",
        "primary_use_case": "ERP",
        "assumed_user_count": 50000,
        "assumed_peak_rps": 100,
        "assumed_regions": ["us-east-1"],
        "key_assumptions": ["scaling limit"],
        "out_of_scope": ["auth"],
        "execution_phases": ["Phase 1"],
        "critical_constraints": ["Latency"],
        "injection_detected": False
    }

    with patch('app.orchestrator.waves.get_existing_artifact', new_callable=AsyncMock) as mock_cache, \
         patch('app.orchestrator.waves.run_planner', new_callable=AsyncMock) as mock_run_planner, \
         patch('app.orchestrator.waves.run_architecture', new_callable=AsyncMock) as mock_run_arch, \
         patch('app.orchestrator.waves.run_aws_expert', new_callable=AsyncMock) as mock_run_aws, \
         patch('app.orchestrator.waves.send_nestjs_callback', new_callable=AsyncMock) as mock_callback:
         
         async def mock_get_cache(job_id, type_str, trace_id=None):
             if type_str == "PLAN":
                 return cached_plan
             return None
             
         mock_cache.side_effect = mock_get_cache

         arch = ArchitectureModel(
            schema_version="1.0",
            prompt_version="architecture/v1",
            model_name="claude-sonnet-4-6",
            provider_name="anthropic",
            generated_at="2026-06-25T12:00:00Z",
            architecture_pattern="microservices",
            components=[],
            database_primary="rds postgres",
            database_replica_strategy="read replica",
            caching_layer="redis",
            message_queue="rabbitmq",
            cdn_required=True,
            ha_strategy="multi-az",
            dr_rto_minutes=15,
            dr_rpo_minutes=5,
            identified_spofs=["none"],
            architecture_decisions=["use redis"]
         )
         mock_run_arch.return_value = (arch, RunUsage(input_tokens=10, output_tokens=10))

         aws = AwsArchitecture(
            schema_version="1.0",
            prompt_version="aws-expert/v1",
            model_name="claude-sonnet-4-6",
            provider_name="anthropic",
            generated_at="2026-06-25T12:00:00Z",
            primary_region="us-east-1",
            secondary_region=None,
            vpc_design="three-tier",
            services=[],
            networking_topology="transit gateway",
            load_balancer_type="alb",
            auto_scaling_strategy="cpu metrics",
            backup_strategy="daily snapshots",
            aws_well_architected_notes=[]
         )
         mock_run_aws.return_value = (aws, RunUsage(input_tokens=10, output_tokens=10))

         result = await run_pipeline("job-123", "Build a school ERP for 50,000 users")
         
         assert result["PLAN"].system_name == "Cached ERP"
         mock_run_planner.assert_not_called()
