import os
import yaml
import structlog

logger = structlog.get_logger()

def load_agent_prompt(agent_name: str, version: str = "v1") -> str:
    possible_paths = [
        os.path.join(os.getcwd(), "packages", "shared-prompts", agent_name, f"{version}.md"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "packages", "shared-prompts", agent_name, f"{version}.md"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "packages", "shared-prompts", agent_name, f"{version}.md"),
        os.path.join("/app", "packages", "shared-prompts", agent_name, f"{version}.md"),
        os.path.join("/usr/src/app", "packages", "shared-prompts", agent_name, f"{version}.md")
    ]
    path = None
    for p in possible_paths:
        if os.path.exists(p):
            path = p
            break
            
    if not path:
        err_msg = f"Prompt file for {agent_name} {version} not found in search paths: {possible_paths}"
        logger.error("prompt_file_not_found", search_paths=possible_paths)
        raise FileNotFoundError(err_msg)
        
    logger.info("loading_prompt_file", path=path, agent=agent_name, version=version)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
        
    parts = content.split("---")
    if len(parts) >= 3:
        # frontmatter is parts[1]
        body = "---".join(parts[2:])
    else:
        body = content
        
    # Strip Change Log section to keep system prompt clean
    if "# Change Log" in body:
        body = body.split("# Change Log")[0]
        
    return body.strip()
