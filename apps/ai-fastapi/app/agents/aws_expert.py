import json
from pydantic_ai import Agent
from app.models.planner import ProjectPlan
from app.models.aws_expert import AwsArchitecture
from app.core.prompts import load_agent_prompt
from app.core.retry import run_agent_with_retry

aws_expert_agent = Agent(
    'anthropic:claude-3-5-sonnet-latest',
    result_type=AwsArchitecture,
    system_prompt=load_agent_prompt("aws-expert", "v1")
)

async def run_aws_expert(plan: ProjectPlan, trace_id: str = None) -> AwsArchitecture:
    plan_json = plan.model_dump_json(indent=2)
    prompt = f"Here is the Project Plan:\n\n{plan_json}\n\nGenerate the AWS Architecture."
    
    result = await run_agent_with_retry(
        agent=aws_expert_agent,
        prompt=prompt,
        agent_name="aws_expert",
        trace_id=trace_id
    )
    return result.data
