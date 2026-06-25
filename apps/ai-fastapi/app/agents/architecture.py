import json
from pydantic_ai import Agent
from app.models.planner import ProjectPlan
from app.models.architecture import ArchitectureModel
from app.core.prompts import load_agent_prompt
from app.core.retry import run_agent_with_retry

architecture_agent = Agent(
    'anthropic:claude-3-5-sonnet-latest',
    output_type=ArchitectureModel,
    system_prompt=load_agent_prompt("architecture", "v1")
)

async def run_architecture(plan: ProjectPlan, trace_id: str = None):
    plan_json = plan.model_dump_json(indent=2)
    prompt = f"Here is the Project Plan:\n\n{plan_json}\n\nGenerate the Architecture Model."
    
    result = await run_agent_with_retry(
        agent=architecture_agent,
        prompt=prompt,
        agent_name="architecture",
        trace_id=trace_id
    )
    return result.output, result.usage
