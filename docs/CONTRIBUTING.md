# Contributing to CloudForge AI

Welcome! Thank you for contributing to CloudForge.

## Workflow

1. All development must be done on branches named `feature/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*`, or `hotfix/*`.
2. Follow Conventional Commits:
   - `feat(component): description`
   - `fix(component): description`
   - `chore(component): description`
3. Write clean, modular code. Do not use raw console logging or print statements in production code. Use the custom logging service in api-nest and structlog in ai-fastapi.
4. Ensure all changes pass lint and typecheck tests:
   ```bash
   npm run lint
   npm run type-check
   ```
5. Open a Pull Request targeting the `main` branch. Direct pushes to `main` are disabled.
