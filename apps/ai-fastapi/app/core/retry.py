import os
from datetime import datetime
import structlog
from tenacity import AsyncRetrying, stop_after_attempt, wait_exponential, retry_if_exception
from pydantic import ValidationError
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai import RunUsage
import httpx

logger = structlog.get_logger()

class FatalAgentError(Exception):
    def __init__(self, message: str, agent: str, fatal: bool = True):
        self.message = message
        self.agent = agent
        self.fatal = fatal
        super().__init__(message)

def is_retryable_exception(exception: Exception) -> bool:
    if isinstance(exception, (ValidationError, UnexpectedModelBehavior, httpx.HTTPError)):
        return True
    try:
        import anthropic
        if isinstance(exception, anthropic.APIError):
            status_code = getattr(exception, "status_code", 500)
            if status_code is None or status_code >= 500:
                return True
    except ImportError:
        # anthropic library is optional, ignore if not installed
        pass
    return False

def get_mock_agent_result(agent_name: str):
    from app.models.planner import ProjectPlan
    from app.models.architecture import ArchitectureModel, ServiceComponent
    from app.models.aws_expert import AwsArchitecture, AwsService

    usage = RunUsage(input_tokens=150, output_tokens=320)
    now = datetime.utcnow()

    if agent_name == "planner":
        output = ProjectPlan(
            schema_version="1.0",
            prompt_version="planner/v1",
            model_name="claude-sonnet-4-6",
            provider_name="anthropic",
            generated_at=now,
            system_name="School ERP",
            scale_tier="enterprise",
            primary_use_case="School ERP system managing students, grades, fees, admissions, and schedules.",
            assumed_user_count=50000,
            assumed_peak_rps=150,
            assumed_regions=["us-east-1"],
            key_assumptions=["50,000 active users", "High availability required", "Single primary region"],
            out_of_scope=["Multilingual support", "Legacy DB migration"],
            execution_phases=["Phase 1: Core Portal", "Phase 2: Fee Modules", "Phase 3: Scheduling"],
            critical_constraints=["Latency < 200ms", "Zero downtime during deployment"],
            injection_detected=False
        )
    elif agent_name == "architecture":
        output = ArchitectureModel(
            schema_version="1.0",
            prompt_version="architecture/v1",
            model_name="claude-sonnet-4-6",
            provider_name="anthropic",
            generated_at=now,
            architecture_pattern="Microservices Pattern",
            components=[
                ServiceComponent(
                    name="auth-service",
                    responsibility="Authentication and RBAC",
                    technology="Node.js NestJS, Redis",
                    scales_horizontally=True,
                    single_point_of_failure=False
                ),
                ServiceComponent(
                    name="student-portal",
                    responsibility="Student registration, academic profile management",
                    technology="Python FastAPI",
                    scales_horizontally=True,
                    single_point_of_failure=False
                )
            ],
            database_primary="RDS PostgreSQL",
            database_replica_strategy="Multi-AZ Read Replicas",
            caching_layer="Elasticache Redis",
            message_queue="BullMQ on Redis",
            cdn_required=True,
            ha_strategy="Multi-AZ deployment",
            dr_rto_minutes=15,
            dr_rpo_minutes=5,
            identified_spofs=["No direct SPOF identified thanks to Multi-AZ"],
            architecture_decisions=["Use PostgreSQL with JSONB for flexible artifact storage"]
        )
    else: # aws_expert
        output = AwsArchitecture(
            schema_version="1.0",
            prompt_version="aws-expert/v1",
            model_name="claude-sonnet-4-6",
            provider_name="anthropic",
            generated_at=now,
            primary_region="us-east-1",
            secondary_region="us-west-2",
            vpc_design="Multi-AZ Public/Private VPC",
            services=[
                AwsService(
                    service_name="Amazon ECS (Fargate)",
                    purpose="Running API and AI services without managing servers",
                    configuration="Fargate tasks inside private subnets behind ALB",
                    alternatives_considered=["AWS EKS", "EC2 Instances"],
                    justification="EKS is too complex for initial phase; EC2 increases management overhead."
                )
            ],
            networking_topology="ALB -> Fargate -> RDS",
            load_balancer_type="Application Load Balancer",
            auto_scaling_strategy="CPU/Memory-based scaling policies",
            backup_strategy="AWS Backup daily snapshots",
            aws_well_architected_notes=["Security: All data encrypted at rest and in transit.", "Reliability: Multi-AZ databases."]
        )

    class MockRunResult:
        def __init__(self, output, usage):
            self.output = output
            self.usage = usage

    return MockRunResult(output, usage)

async def run_agent_with_retry(agent, prompt, deps=None, agent_name="unknown", trace_id=None):
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or api_key.startswith("mock"):
        logger.info("Using mock fallback for agent due to missing or mock API key", agent=agent_name)
        return get_mock_agent_result(agent_name)

    attempt = 0
    try:
        async for attempt_state in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=8),
            retry=retry_if_exception(is_retryable_exception),
            reraise=True
        ):
            with attempt_state:
                attempt += 1
                temp = 0.0 if attempt == 1 else (0.2 if attempt == 2 else 0.5)
                logger.info(
                    "Executing agent attempt",
                    agent=agent_name,
                    attempt=attempt,
                    temperature=temp,
                    trace_id=trace_id
                )
                return await agent.run(prompt, deps=deps, model_settings={"temperature": temp})
    except Exception as e:
        logger.error(
            "Agent execution failed after all retries",
            agent=agent_name,
            error=str(e),
            trace_id=trace_id
        )
        raise FatalAgentError(
            message=f"Agent '{agent_name}' failed after 3 attempts. Last error: {str(e)}",
            agent=agent_name,
            fatal=True
        ) from e
    raise RuntimeError("Unexpected end of run_agent_with_retry loop")
