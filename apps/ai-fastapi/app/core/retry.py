import structlog
from tenacity import AsyncRetrying, stop_after_attempt, wait_exponential, retry_if_exception
from pydantic import ValidationError
from pydantic_ai.exceptions import UnexpectedModelBehavior
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
        pass
    return False

async def run_agent_with_retry(agent, prompt, deps=None, agent_name="unknown", trace_id=None):
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
