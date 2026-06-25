import os

# Map standard workspace model configuration names to official Anthropic API model identifiers
MODEL_MAPPING = {
    "claude-sonnet-4-6": "anthropic:claude-3-5-sonnet-20241022",
    "claude-haiku-4-5": "anthropic:claude-3-5-haiku-20241022"
}

# Default agent model definitions (matching packages/shared-config/src/index.ts)
AGENT_DEFAULTS = {
    "planner": {
        "model": "claude-sonnet-4-6",
        "prompt_version": "v1",
        "max_tokens": 2000,
        "max_retries": 3
    },
    "architecture": {
        "model": "claude-sonnet-4-6",
        "prompt_version": "v1",
        "max_tokens": 3000,
        "max_retries": 3
    },
    "aws_expert": {
        "model": "claude-sonnet-4-6",
        "prompt_version": "v1",
        "max_tokens": 3000,
        "max_retries": 3
    },
    "diagram": {
        "model": "claude-haiku-4-5",
        "prompt_version": "v1",
        "max_tokens": 2000,
        "max_retries": 2
    }
}

def get_agent_model_identifier(agent_name: str) -> str:
    config = AGENT_DEFAULTS.get(agent_name, AGENT_DEFAULTS["planner"])
    model_config_name = config["model"]
    return MODEL_MAPPING.get(model_config_name, "anthropic:claude-3-5-sonnet-20241022")

def get_agent_model_config_name(agent_name: str) -> str:
    config = AGENT_DEFAULTS.get(agent_name, AGENT_DEFAULTS["planner"])
    return config["model"]
