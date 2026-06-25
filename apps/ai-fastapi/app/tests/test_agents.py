import pytest
from app.orchestrator.token_accounting import calculate_cost
from app.core.prompts import load_agent_prompt

def test_calculate_cost():
    # Test Sonnet pricing
    sonnet_cost = calculate_cost("claude-sonnet-4-6", 1000, 2000)
    # Sonnet input: $3/M, output: $15/M
    # (1000 * 3 / 1,000,000) + (2000 * 15 / 1,000,000) = 0.003 + 0.030 = 0.033
    assert abs(sonnet_cost - 0.033) < 1e-6

    # Test Haiku pricing
    haiku_cost = calculate_cost("claude-haiku-4-5", 1000, 2000)
    # Haiku input: $0.80/M, output: $4/M
    # (1000 * 0.8 / 1,000,000) + (2000 * 4 / 1,000,000) = 0.0008 + 0.0080 = 0.0088
    assert abs(haiku_cost - 0.0088) < 1e-6

def test_load_prompt_template():
    # Verify we can load existing templates or fail cleanly
    try:
        content = load_agent_prompt("planner", "v1")
        assert len(content) > 0
    except FileNotFoundError:
        pytest.fail("Planner prompt template not found")
