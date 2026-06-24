# Versioning Policy

## Application Versioning
We use Semantic Versioning (SemVer) for the main applications:
- Major: Breaking API changes or core architecture modifications
- Minor: Adding new features/agents
- Patch: Bug fixes, lints, library updates

## Prompt Versioning
Prompts are versioned, immutable files under `packages/shared-prompts/`.
- Every prompt must reside in `<agent_name>/v<N>.md`
- Updates to system prompts must create a new version file (e.g. `v2.md`) instead of mutating existing ones
- Changing prompt versions requires updates to `packages/shared-config/src/index.ts`
