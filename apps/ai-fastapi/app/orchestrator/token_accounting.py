def calculate_cost(model_name: str, input_tokens: int, output_tokens: int) -> float:
    model_lower = model_name.lower()
    if "haiku" in model_lower:
        # Claude 3.5 Haiku pricing
        input_rate = 0.80 / 1_000_000
        output_rate = 4.00 / 1_000_000
    else:
        # Default to Claude 3.5 Sonnet pricing
        input_rate = 3.0 / 1_000_000
        output_rate = 15.0 / 1_000_000
        
    return (input_tokens * input_rate) + (output_tokens * output_rate)
