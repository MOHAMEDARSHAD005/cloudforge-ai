# Operating Rules

Never invent architecture.

Follow ADRs exactly.

Never start the next phase without approval.

No raw LLM output reaches the database.

No console.log()

No print()

Always produce:

1. Task List
2. Implementation Plan
3. Files to Create
4. Files to Modify
5. Validation Checklist

before writing code.

Never interpolate user input/URLs into log messages (prevent log injection). Use static messages with structured metadata.
Never create local Python modules named after Python standard library modules (e.g. logging, sys, json, asyncio).
Always remove unused imports before final validation.

