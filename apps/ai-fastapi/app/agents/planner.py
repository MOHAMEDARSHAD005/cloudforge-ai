from pydantic_ai import Agent
from app.models.planner import ProjectPlan
from app.core.prompts import load_agent_prompt
from app.core.retry import run_agent_with_retry
from app.core.config import get_agent_model_identifier

planner_agent = Agent(
    get_agent_model_identifier("planner"),
    output_type=ProjectPlan,
    system_prompt=load_agent_prompt("planner", "v1")
)

async def run_planner(requirement: str, trace_id: str = None):
    result = await run_agent_with_retry(
        agent=planner_agent,
        prompt=requirement,
        agent_name="planner",
        trace_id=trace_id
    )
    return result.output, result.usage
