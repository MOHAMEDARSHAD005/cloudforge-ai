from pydantic_ai import Agent
from app.models.planner import ProjectPlan
from app.core.prompts import load_agent_prompt
from app.core.retry import run_agent_with_retry

planner_agent = Agent(
    'anthropic:claude-3-5-sonnet-latest',
    output_type=ProjectPlan,
    system_prompt=load_agent_prompt("planner", "v1")
)

async def run_planner(requirement: str, trace_id: str = None) -> ProjectPlan:
    result = await run_agent_with_retry(
        agent=planner_agent,
        prompt=requirement,
        agent_name="planner",
        trace_id=trace_id
    )
    return result.output
