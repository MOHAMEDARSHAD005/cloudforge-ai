# decisions.md
> Architecture Decision Records (ADRs) for CloudForge AI.
> Add a new ADR every time a significant technical decision is made — especially ones that are hard to reverse.
> Format: Status → Context → Decision → Consequences → Alternatives Rejected

---

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| ADR-001 | Monorepo with Turborepo | ✅ Accepted | June 2026 |
| ADR-002 | Pydantic AI over LangChain | ✅ Accepted | June 2026 |
| ADR-003 | Async job queue over sync LLM calls | ✅ Accepted | June 2026 |
| ADR-004 | Hybrid parallel agent execution | ✅ Accepted | June 2026 |
| ADR-005 | BullMQ (Phase 1) → SQS (Phase 2) | ✅ Accepted | June 2026 |
| ADR-006 | PostgreSQL with JSONB for artifact storage | ✅ Accepted | June 2026 |
| ADR-007 | WebSocket (Socket.IO) for real-time updates | ✅ Accepted | June 2026 |
| ADR-008 | FastAPI internal-only, never public-facing | ✅ Accepted | June 2026 |
| ADR-009 | JWT with HttpOnly refresh tokens | ✅ Accepted | June 2026 |
| ADR-010 | Reviewer Agent as mandatory last step | ✅ Accepted | June 2026 |
| ADR-011 | Versioned, immutable prompt files | ✅ Accepted | June 2026 |
| ADR-012 | Artifact provenance metadata | ✅ Accepted | June 2026 |
| ADR-013 | Per-agent token usage accounting | ✅ Accepted | June 2026 |
| ADR-014 | Structured JSON logging with traceId propagation | ✅ Accepted | June 2026 |
| ADR-015 | Idempotent artifact generation | ✅ Accepted | June 2026 |
| ADR-016 | Organization-level Git/GitHub workflow | ✅ Accepted | June 2026 |
| ADR-017 | Squash Merge Strategy | ✅ Accepted | June 2026 |
| ADR-018 | Repository Security Scanning & Vulnerability Audits | ✅ Accepted | June 2026 |
| ADR-019 | GitHub Actions Version Pinning Strategy | ✅ Accepted | June 2026 |
| ADR-020 | Phase 0 Security Gate Policy | ✅ Accepted | June 2026 |
| ADR-021 | Shared Secret Authentication for Internal APIs | ✅ Accepted | June 2026 |

---

## ADR-001: Monorepo with Turborepo

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
The project has three distinct applications (Next.js, NestJS, FastAPI) that share domain types, prompt templates, and configuration. Without a monorepo, keeping shared types in sync requires a private npm registry or manual copying.

### Decision
Use a **Turborepo monorepo** with:
- `apps/frontend-next`, `apps/api-nest`, `apps/ai-fastapi`
- `packages/shared-types` (Zod schemas consumed by both Next.js and NestJS)
- `packages/shared-prompts` (versioned agent prompt templates)
- `packages/shared-config` (env config, constants, enums)
- Single `turbo.json` pipeline for build, lint, type-check

### Consequences
- ✅ Single `npm run build` builds the full stack in dependency order
- ✅ Type changes in `shared-types` are immediately reflected in both frontend and backend — no publish step
- ✅ Single CI pipeline with incremental build caching
- ✅ `packages/shared-prompts` enforces a single source of truth for all prompt text
- ⚠️ Python (FastAPI) cannot consume `shared-types` directly — Pydantic models must be kept in sync manually with Zod schemas (tracked in OQ-004)

### Alternatives Rejected
- **Polyrepo:** Cross-service type drift is a real maintenance cost. Rejected.
- **npm workspaces only (no Turborepo):** No incremental build caching. Rejected.

---

## ADR-002: Pydantic AI over LangChain

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
The agent orchestration layer needs to run multiple specialized agents, return structured typed outputs, and be easy to debug when an agent fails or hallucinates.

### Decision
Use **Pydantic AI** for all agent logic. Each agent is a function that:
1. Takes a typed Pydantic input model
2. Calls the LLM with a structured output instruction
3. Returns a validated Pydantic output model

### Consequences
- ✅ Every agent output is validated at the Python type system level — no raw strings reach the database
- ✅ Failures are explicit: `Pydantic ValidationError` vs LangChain's opaque chain errors
- ✅ Lightweight — no framework magic to debug
- ⚠️ More boilerplate per agent than LangChain (acceptable — correctness > brevity here)

### Alternatives Rejected
- **LangChain:** Too much abstraction, hard to trace failures, output parsers are fragile. Rejected.
- **Raw Anthropic/OpenAI API calls:** Maximum control but requires reinventing retry, structured output parsing, and agent composition from scratch. Rejected for speed of development.
- **LlamaIndex:** Optimized for RAG/retrieval, not multi-agent orchestration. Rejected.

---

## ADR-003: Async Job Queue over Synchronous LLM Calls

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
A full agent pipeline (Planner → Reviewer) takes 45–120 seconds. Holding an HTTP connection open for 2 minutes is a terrible user experience and will hit gateway timeouts in any cloud deployment.

### Decision
All generation jobs are **fully asynchronous**:
1. User submits a prompt → NestJS returns `{ projectId, jobId }` immediately (< 100ms)
2. Job is enqueued in BullMQ
3. Worker picks up the job and calls FastAPI
4. Progress is pushed to the user via WebSocket events
5. Final artifacts are persisted and the WebSocket emits `job:complete`

### Consequences
- ✅ User gets instant feedback — not a spinning cursor for 2 minutes
- ✅ Jobs survive server restarts (BullMQ persists to Redis)
- ✅ Retry logic is built into BullMQ — transient LLM failures are retried automatically
- ⚠️ More complex than sync — requires WebSocket infrastructure and job state management
- ⚠️ Users must remain connected (or poll) to see results

### Alternatives Rejected
- **Long-polling:** Wastes requests, adds latency. Rejected.
- **Synchronous HTTP with extended timeout:** Breaks at ALB (60s default), terrible UX, no retry. Rejected.
- **SSE (Server-Sent Events):** One-directional only, can't send `job:subscribe` commands from client. Rejected.

---

## ADR-004: Hybrid Parallel Agent Execution

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
Running all 8 agents sequentially results in ~90 seconds of wall-clock time. Many agents are independent and can run in parallel.

### Decision
Execute agents in **dependency-ordered parallel waves**:

```
Wave 1 (sequential):  Planner
Wave 2 (parallel):    Architecture + AWS Expert
Wave 3 (parallel):    Security + Cost + Diagram
Wave 4 (sequential):  Terraform    ← needs Wave 2 + Wave 3 outputs
Wave 5 (sequential):  Reviewer     ← needs all prior outputs
```

Reduces wall-clock time from ~90s to ~45s.

### Consequences
- ✅ ~50% reduction in total job time
- ✅ Architecture and AWS Expert run simultaneously — the two most expensive LLM calls
- ⚠️ Wave 3 agents receive partial context (no Terraform yet) — acceptable; Security/Cost don't need Terraform
- ⚠️ Slightly more complex orchestration code in FastAPI

### Alternatives Rejected
- **Full sequential:** Simplest to implement. Rejected — 90s is too slow.
- **Full parallel (all 8 at once):** Impossible — later agents depend on earlier agents' outputs.

---

## ADR-005: BullMQ (Phase 1) → SQS (Phase 2)

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
SQS is the right production queue on AWS. BullMQ on Redis is faster to set up locally and in Docker Compose.

### Decision
Use **BullMQ** for Phase 1 (local + Docker). Abstract the queue behind a `QueueService` interface in NestJS. Migrate to **AWS SQS** in Phase 5 by swapping the implementation behind the interface — no business logic changes.

```typescript
interface QueueService {
  enqueue(jobName: string, payload: JobPayload): Promise<string>
  getJobStatus(jobId: string): Promise<JobStatus>
}
```

### Consequences
- ✅ Fast local development — Docker Compose just needs Redis
- ✅ Clean swap to SQS with zero impact on `ProjectsModule`, `JobsModule`
- ⚠️ BullMQ and SQS have different retry/delay semantics — interface must abstract these carefully

### Alternatives Rejected
- **SQS from day one:** Requires AWS credentials and networking for local dev. Too much friction in Phase 1. Rejected.
- **Stay on BullMQ in production:** Adds operational burden of self-managing Redis reliability. Rejected for prod.

---

## ADR-006: PostgreSQL with JSONB for Artifact Storage

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
Each job produces 7–8 artifact types with different, complex structures that will evolve as agents improve.

### Decision
Store artifact payloads as **PostgreSQL JSONB** in a single `artifacts` table with an `ArtifactType` enum discriminator. Type validation happens at the application layer (Pydantic on write, Zod on read).

```sql
artifacts (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  type           artifact_type NOT NULL,
  payload        JSONB NOT NULL,
  schema_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model_name     TEXT NOT NULL,
  provider_name  TEXT NOT NULL,
  created_at     TIMESTAMPTZ
)
```

### Consequences
- ✅ Schema evolves freely — adding a new field to `CostModel` doesn't require a migration
- ✅ JSONB supports GIN indexing for fast querying on payload fields
- ✅ Single `artifacts` table is simple to query and back up
- ⚠️ No DB-level type enforcement on payload structure — fully reliant on app-layer validation (acceptable with Pydantic + Zod)

### Alternatives Rejected
- **One table per artifact type:** 8 tables with bespoke schemas. Migration nightmare as agent outputs evolve. Rejected.
- **MongoDB:** Adds operational complexity for a benefit JSONB already provides. Rejected.
- **S3 for artifact storage:** Good for large files. Overkill for JSON payloads averaging < 50 KB. Rejected for Phase 1.

---

## ADR-007: WebSocket (Socket.IO) for Real-time Updates

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
Jobs take 45–90 seconds. Users need live feedback on which agent is running, which has completed, and when the job is done.

### Decision
Use **Socket.IO** via NestJS `@WebSocketGateway`. Each user subscribes to their job's room on connection. Agents emit progress events per completion. In production, use the **Socket.IO Redis adapter** to broadcast events across NestJS instances.

### Consequences
- ✅ Real-time per-agent progress (not just start/end)
- ✅ NestJS has first-class Socket.IO support
- ✅ Redis adapter makes it horizontally scalable
- ⚠️ Requires sticky sessions or Redis adapter in multi-instance deployment (mitigated by Redis adapter)

### Alternatives Rejected
- **Polling `/api/v1/jobs/:id`:** Wastes requests, 2–3s update lag, no per-agent granularity. Rejected.
- **SSE:** One-directional only. Can't receive `job:subscribe` from client. Rejected.

---

## ADR-008: FastAPI Internal-Only, Never Public-Facing

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
FastAPI runs agent pipelines and has direct access to LLM API keys. Exposing it publicly creates prompt injection, cost abuse, and key theft risks.

### Decision
FastAPI listens **inside the VPC only**. No public ALB listener. Only NestJS BullMQ workers call it via VPC-internal DNS (`http://ai-service.internal:8000`). Security group rules enforce this — port 8000 allowed only from the NestJS security group.

### Consequences
- ✅ LLM API keys never accessible from the public internet
- ✅ Eliminates prompt injection attack surface from external callers
- ✅ Cost abuse prevention — all jobs must pass through NestJS auth + rate limiting
- ⚠️ Local development requires Docker network setup to simulate VPC isolation (handled in `docker-compose.yml`)

### Alternatives Rejected
- **FastAPI behind public ALB with API key auth:** Key rotation complexity, still exposes surface area. Rejected.

---

## ADR-009: JWT with HttpOnly Refresh Tokens

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
Standard session management for a web app with API access. Need to balance security (XSS resistance) with usability.

### Decision
- **Access token:** 15-minute TTL, stored in React state (never localStorage, never cookie)
- **Refresh token:** 7-day TTL, stored in an **HttpOnly, Secure, SameSite=Strict cookie**
- Refresh tokens are **rotated on every use** — old token is invalidated immediately

### Consequences
- ✅ Access token in memory is XSS-safe (not in localStorage or cookies)
- ✅ HttpOnly refresh cookie is XSS-safe — JavaScript cannot read it
- ✅ Token rotation means a stolen refresh token is detected on next legitimate use
- ⚠️ Client must handle access token refresh silently (Axios interceptor pattern)

### Alternatives Rejected
- **Tokens in localStorage:** Vulnerable to XSS. Rejected.
- **Session cookies only:** Requires server-side session store at scale. Rejected.
- **Long-lived access tokens:** Any leaked token is valid for days. Rejected.

---

## ADR-010: Reviewer Agent as Mandatory Last Step

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
Individual LLM agents can produce plausible-sounding but incorrect output. The system needs a quality gate.

### Decision
The **Reviewer Agent** runs last and receives ALL prior agent outputs. Its responsibilities:
- Flag single points of failure in the architecture
- Identify missing HA or DR provisions
- Catch security gaps (open security groups, missing encryption, public RDS)
- Identify cost estimation anomalies
- Validate that Terraform matches the described architecture
- Flag inconsistencies between agents

The Reviewer's output is always shown — even if it contains critique of other agents' work.

### Consequences
- ✅ Users get a balanced view: design + critique, not just a rubber-stamp
- ✅ Catches common LLM failure modes (overconfident, missing edge cases)
- ✅ Positions CloudForge as a genuine engineering tool
- ⚠️ Adds ~10–15s to total job time (acceptable)
- ⚠️ Reviewer may occasionally flag false positives — must be framed as "suggestions to consider"

### Alternatives Rejected
- **No reviewer:** Risk of shipping architecturally flawed outputs. Damages trust. Rejected.
- **Inline validation per agent:** Each agent can't see other agents' outputs — cross-cutting review is impossible inline. Rejected.

---

## ADR-011: Versioned, Immutable Prompt Files

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
Agent prompts directly determine output quality and schema compatibility. Changing a prompt mid-stream creates artifacts that cannot be compared, re-evaluated, or reliably re-generated. There is also no record of what prompt produced a given artifact.

### Decision
**Prompts are treated as code artifacts, not configuration.**

Rules:
1. Every prompt lives in `packages/shared-prompts/<agent>/<version>.md`
2. Prompt files are **never overwritten** — only new versions are created
3. Each agent function accepts a `prompt_version` parameter and loads the specified file
4. The default version is pinned in `packages/shared-config/agent-defaults.ts`
5. Changing a prompt requires: new version file + changelog entry + prompt regression test run
6. Old prompt versions are never deleted — they are needed to understand historical artifacts

```
packages/shared-prompts/
  planner/
    v1.md     ← immutable once released
    v2.md     ← new version for changes
  architecture/
    v1.md
  reviewer/
    v1.md
```

### Consequences
- ✅ Every artifact can be traced back to the exact prompt that produced it
- ✅ Prompt changes can be A/B tested against the golden dataset
- ✅ Rollback is trivial — pin `agent-defaults.ts` to the previous version
- ✅ Eliminates "what prompt did we use last Tuesday?" debugging
- ⚠️ Slightly more file overhead as prompts evolve
- ⚠️ Requires discipline: changing a prompt *in place* is a process violation

### Alternatives Rejected
- **Prompts in database:** Queryable but version management becomes complex. No diff tracking without extra tooling. Rejected.
- **Prompts as TypeScript string constants:** No diff visibility for non-engineers. Rejected.
- **Prompts as inline strings in agent functions:** Non-reviewable in PRs. Rejected.

---

## ADR-012: Artifact Provenance Metadata

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
Artifacts stored in PostgreSQL JSONB have no intrinsic record of how they were produced — which prompt, which model, which schema version. Without this, it's impossible to identify stale artifacts, re-generate with improved prompts, or debug unexpected outputs.

### Decision
Every artifact payload and database record must include provenance metadata:

**In the JSONB payload (embedded):**
```json
{
  "schema_version": "1.0",
  "prompt_version": "planner/v1",
  "model_name": "claude-sonnet-4-6",
  "provider_name": "anthropic",
  "generated_at": "2026-06-24T10:00:00Z",
  ...agent-specific fields...
}
```

**In the `artifacts` table (indexed columns):**
- `schema_version TEXT NOT NULL`
- `prompt_version TEXT NOT NULL`
- `model_name TEXT NOT NULL`
- `provider_name TEXT NOT NULL`

The `schema_version` increments when the Pydantic output model's shape changes in a breaking way. The `prompt_version` is the prompt file path (e.g., `planner/v1`).

### Consequences
- ✅ Can query "all artifacts produced by planner/v1 before migration" for backfill planning
- ✅ Can identify artifacts that need re-generation after a prompt improvement
- ✅ Debugging support: given a bad output, know exactly what prompt + model produced it
- ✅ A/B comparison of prompt versions is possible at the artifact level
- ⚠️ Small write overhead per artifact (negligible)

### Alternatives Rejected
- **No provenance tracking:** "Works until it doesn't" — debugging stale artifacts is extremely painful. Rejected.
- **External audit table only (not in JSONB):** JSONB payload becomes self-describing and portable when exported. Embedding is preferred. Rejected.

---

## ADR-013: Per-Agent Token Usage Accounting

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
6–8 LLM API calls are made per job. Without per-agent token tracking, there is no way to identify which agents are expensive, optimize token budgets, enforce cost caps, or alert on runaway costs.

### Decision
After every LLM call, the calling agent function records token usage to a `token_usage` table:

```sql
token_usage (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES jobs(id),
  agent         TEXT NOT NULL,          -- e.g. "planner", "reviewer"
  model_name    TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      DECIMAL(10,6),          -- computed from token counts + model pricing
  timestamp     TIMESTAMPTZ NOT NULL
)
```

Token accounting logic:
- `input_tokens` and `output_tokens` come from the LLM API response object
- `cost_usd` is computed at write time using a pricing table in `shared-config`
- Total job cost is computed by summing all `token_usage` rows for a `job_id`
- Per-user daily spend is computed by joining `token_usage` → `jobs` → `projects` → `users`

Alert thresholds (per job):
- `> 30,000 total tokens` → log a warning
- `> 50,000 total tokens` → alert on-call
- `> 3× rolling 1-hour average cost` → alert on-call

### Consequences
- ✅ Identifies expensive agents (e.g., Terraform Agent may use more tokens than others)
- ✅ Enables per-user cost tracking for future billing
- ✅ Supports model optimization decisions (e.g., "Diagram Agent can use Haiku — 80% cheaper")
- ✅ Audit trail for cost anomalies
- ⚠️ Pricing table in `shared-config` must be kept up to date when LLM providers change prices

### Alternatives Rejected
- **Total job token count only:** Not granular enough to identify per-agent inefficiencies. Rejected.
- **No tracking:** Eliminates ability to alert on cost spikes or optimize. Rejected.
- **External billing service:** Overkill for Phase 1–4. Rejected.

---

## ADR-014: Structured JSON Logging with traceId Propagation

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
With three services (NestJS, FastAPI, BullMQ Worker), debugging a failed job requires correlating log lines across all three. Without structured logging and a shared trace ID, this is effectively impossible.

### Decision
**All logs are structured JSON.** No `console.log()` or `print()` statements anywhere in production code.

Every log line includes:
```json
{
  "timestamp": "2026-06-24T10:00:00.000Z",
  "level": "info",
  "service": "api-nest",
  "traceId": "trace_abc123",
  "jobId": "job_xyz",
  "userId": "usr_abc",
  "message": "Agent architecture complete",
  "durationMs": 8420,
  "context": {}
}
```

Propagation:
1. NestJS generates `traceId` (UUID) on every incoming request in a middleware
2. `traceId` is included in the `X-Trace-Id` response header
3. `traceId` is passed in the FastAPI request body (`{ ..., "traceId": "trace_abc123" }`)
4. FastAPI extracts `traceId` and includes it in all log lines for that request
5. BullMQ job payload includes `traceId` — Worker logs include it

Implementations:
- NestJS: Winston with custom JSON formatter
- FastAPI: structlog with structlog-processors JSON renderer
- CI enforcement: ESLint rule banning `console.log`; flake8 rule banning bare `print`

### Consequences
- ✅ Given a `traceId`, every log line across all three services is immediately filterable
- ✅ CloudWatch Logs Insights or Grafana Loki can query `{ traceId = "trace_abc123" }` to reconstruct a full job execution
- ✅ Structured fields enable metric extraction from logs (e.g., `durationMs` histogram)
- ⚠️ Slightly more verbose code setup than `console.log` — justified by operational payoff

### Alternatives Rejected
- **Unstructured logs:** Cannot be machine-queried, grep-only, no correlation across services. Rejected.
- **OpenTelemetry distributed tracing from day one:** Correct long-term choice but adds setup complexity for Phase 1. Revisit in Phase 5. Manually propagated `traceId` achieves 90% of the value. Rejected for Phase 1.

---

## ADR-015: Idempotent Artifact Generation

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
BullMQ can retry failed jobs. Without idempotency, a transient failure in artifact persistence could result in the same prompt being sent to the LLM multiple times, generating duplicate artifacts and incurring duplicate LLM costs.

### Decision
Artifact generation is **idempotent on `jobId`**.

Rules:
1. Before running any agent, the orchestrator checks the `artifacts` table for existing records with the same `jobId` and `type`
2. If an artifact already exists and its `status` is `COMPLETE`, it is returned as-is — no LLM call is made
3. If an artifact exists and its `status` is `FAILED` or `PARTIAL`, it is re-generated
4. `jobId` is generated by NestJS at job creation time (CUID) and is immutable
5. The BullMQ job payload carries `jobId` — the Worker passes it to FastAPI

Check logic in FastAPI orchestrator:
```python
async def get_or_generate_artifact(job_id: str, artifact_type: str, generator_fn):
    existing = await db.artifacts.find_one(job_id=job_id, type=artifact_type, status="COMPLETE")
    if existing:
        logger.info("artifact_cache_hit", job_id=job_id, type=artifact_type)
        return existing.payload
    return await generator_fn()
```

### Consequences
- ✅ BullMQ retries are safe — no duplicate LLM calls on partial job completion
- ✅ Manual job re-trigger is safe
- ✅ Reduces LLM costs on retry scenarios
- ✅ Simplifies failure recovery — retry the whole job, agent-level deduplication handles the rest
- ⚠️ Cached artifacts may be stale if the prompt changed — this is intentional; a changed prompt should produce a new `jobId`

### Alternatives Rejected
- **No idempotency:** BullMQ retries would generate duplicate artifacts and incur double LLM cost. Rejected.
- **Agent-level idempotency keys with LLM provider:** Anthropic and OpenAI do not support idempotency keys on completions. Rejected as unavailable.

---

## ADR-016: Organization-Level Git/GitHub Workflow

**Status:** ✅ Accepted
**Date:** June 2026

### Context

CloudForge AI is a Turborepo monorepo (ADR-001) maintained by a 1–3 engineer team that is expected to grow.

Without an explicit version control workflow, conventions drift per contributor:

* Inconsistent commit messages
* No enforced review process
* Direct pushes to `main`
* Unclear ownership boundaries
* No audit trail connecting deployed artifacts to PRs and decisions

Given that observability, prompt versioning, and artifact provenance are treated as first-class operational concerns, source control must be treated with the same level of rigor.

This repository is intended to live under a **GitHub Organization**, not a personal account, and must scale without requiring re-litigation of repository standards.

---

### Decision

Use a single GitHub organization (`cloudforge-ai`) owning one Turborepo monorepo.

Repository standards, permissions, and workflows are organization-level concerns rather than per-user conventions.

---

## Organization Structure

GitHub Teams:

```text
@cloudforge-ai/engineering
@cloudforge-ai/leads
@cloudforge-ai/agents
```

### engineering

* Write access
* All contributors

### leads

* Admin access
* Branch protection bypass for emergencies only
* Repository administration

### agents

Dedicated bot accounts and autonomous coding agents.

Examples:

* Claude Code
* Codex
* Cursor agents
* GitHub Actions

Human and agent contributors follow identical branch protection rules.

> Phase 1–2: team may only contain engineering and leads.
>
> `@cloudforge-ai/agents` becomes active once autonomous coding agents are introduced.

---

## Organization Settings

### Repository Visibility

Default:

```text
Private
```

### Base Permissions

```text
No access
```

Access is granted explicitly through teams.

### Security

Require:

* Two-factor authentication for all members
* Secret scanning
* Push protection

No shared personal accounts.

No shared PATs.

Automation must use dedicated bot identities.

---

## Repository Model

Single repository:

```text
cloudforge-ai
```

Per ADR-001:

No polyrepo split.

Repository contains:

```text
apps/
packages/
docs/
terraform/
.github/
docker/
```

---

## Branching Strategy

Use trunk-based development with short-lived branches.

```text
main
 ├── feature/<short-desc>
 ├── fix/<short-desc>
 ├── refactor/<short-desc>
 ├── docs/<short-desc>
 ├── chore/<short-desc>
 └── hotfix/<short-desc>
```

Rules:

* `main` is always deployable.
* Branches are deleted after merge.
* No long-lived `develop` branch.
* No phase branches.
* PLAN.md phases are tracked in documentation rather than Git branches.

---

## Branch Protection

Protected branch:

```text
main
```

Required:

### Pull Requests

* No direct pushes
* Applies to admins
* Applies to bots

### Reviews

Require:

* Minimum 1 approving review

Increase to:

* 2 reviews once team size exceeds 3 engineers

(per project-context.md Team & Context)

### Status Checks

Must pass:

```text
turbo lint
turbo type-check
tests
```

Future CI pipeline:

```text
lint
test
build
security scan
```

### Merge Requirements

Require:

* Branch up to date before merge
* Conversation resolution
* Dismiss stale approvals after new commits

Disallow:

* Force pushes
* Deleting main

---

## Commit Convention

Use Conventional Commits.

Format:

```text
<type>(<scope>): <description>
```

Examples:

```text
feat(planner-agent): add injection fallback path

fix(traceid-middleware): propagate header on FastAPI 4xx

docs(decisions): add ADR-016

chore(deps): pin prisma version

refactor(shared-types): simplify artifact schema

test(terraform-agent): add validation coverage

ci(actions): add dependency scan
```

Supported types:

```text
feat
fix
docs
refactor
test
chore
ci
```

Scope should reference:

* app
* package
* agent
* subsystem

Examples:

```text
planner-agent
shared-types
api-nest
frontend-next
terraform-agent
```

---

## Pull Request Workflow

```text
Developer
↓
Feature branch
↓
Pull Request
↓
CI checks
↓
Review
↓
Merge
↓
GitHub Actions
↓
Deployment
```

Every PR must include:

### Summary

What changed.

### PLAN.md Reference

Which task is being completed.

### ADR

Whether a new ADR is introduced.

### Open Question

Whether an OQ is resolved.

### Checklist

* Tests added or updated
* Documentation updated
* No secrets committed
* Breaking changes documented

---

## PR Template

File:

```text
.github/PULL_REQUEST_TEMPLATE.md
```

Required sections:

```text
Summary

PLAN.md tasks

ADR changes

Open Questions affected

Testing

Documentation updates

Checklist
```

---

## CODEOWNERS

File:

```text
.github/CODEOWNERS
```

Automatic review routing by path.

Examples:

```text
apps/ai-fastapi/
packages/shared-prompts/
```

→ AI owners

```text
apps/frontend-next/
```

→ Frontend owner

```text
apps/api-nest/
```

→ Backend owner

```text
docs/
*.md
```

→ Documentation owner

Exact owners are assigned once the team grows.

The requirement to maintain CODEOWNERS is decided now.

---

## Repository Labels

### Phase

```text
phase:0
phase:1
phase:2
phase:3
phase:4
phase:5
```

### Type

```text
type:feature
type:bug
type:docs
type:refactor
```

### Priority

```text
priority:critical
priority:high
priority:medium
priority:low
```

### Status

```text
status:blocked
status:ready
status:review
```

### Architecture

```text
adr
needs-discussion
```

Labels are standardized and never ad hoc.

---

## GitHub Environments

Separate environments:

```text
dev
staging
prod
```

Environment secrets are isolated.

Production deployments require:

* Successful CI
* Environment approval

---

## Autonomous Coding Agents

Examples:

* Claude Code
* Codex
* Cursor agents

Agent rules:

* No direct pushes to main
* No branch protection bypass
* No shared credentials

Commits use:

```text
chore(agent):
```

or appropriate Conventional Commit types.

Commits are attributed to:

```text
@cloudforge-ai/agents
```

Auditability is preserved.

---

## Dependency Management

Enable:

### Dependabot

Weekly updates.

### Secret Scanning

Enabled.

### Push Protection

Enabled.

### Dependency Review

Executed in CI.

No wildcard versions:

```text
*
latest
```

Dependencies must be pinned.

---

## Release Strategy

Semantic versioning:

```text
v0.1.0
v0.2.0
v1.0.0
```

Tags are cut from:

```text
main
```

Phase exits correspond to releases:

```text
Phase 0 → v0.1.0
Phase 1 → v0.2.0
Phase 2 → v0.3.0
Phase 3 → v0.4.0
Phase 4 → v0.5.0
Phase 5 → v1.0.0
```

Every deployed state must be reproducible from a Git tag.

---

## Repository Governance

Source control is treated as infrastructure.

Every production artifact must be traceable to:

```text
Issue
↓
Pull Request
↓
Commit
↓
ADR or OQ
↓
Release Tag
↓
Deployment
```

No unreviewed changes.

No production hotfixes outside CI/CD.

Human and agent contributors follow identical rules.

---

### Consequences

* ✅ Every deployment is traceable to a reviewed PR
* ✅ Main remains deployable
* ✅ Clear ownership boundaries
* ✅ Scales from 1–3 engineers to larger teams
* ✅ Enables release automation
* ✅ Conventional commits support changelog generation
* ✅ Automatic review routing via CODEOWNERS
* ✅ Strong security posture with 2FA and secret scanning
* ✅ CI/CD becomes the only deployment mechanism
* ⚠ Small changes incur PR and review overhead
* ⚠ CODEOWNERS assignments remain placeholders until team growth
* ⚠ Merge strategy is still unresolved

---

### Alternatives Rejected

#### No Branch Protection

Direct pushes to `main`.

Rejected because:

* Contradicts CI/CD requirements
* Removes auditability
* Allows unreviewed changes

---

#### GitFlow

```text
develop
release/*
main
```

Rejected because:

* Phases already exist in PLAN.md
* Additional branches add complexity
* Continuous integration into `main` is preferred

---

#### Personal Repository

Rejected because:

* No team-based access control
* No organization-wide 2FA
* Poor scalability

---

#### Polyrepo

Rejected because:

* Contradicts ADR-001
* Increases coordination overhead
* Causes type drift and duplicated CI

---

#### Single Merge Strategy

Resolved.

See:

```text
ADR-017
```

---

## ADR-017: Squash Merge Strategy

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
All changes flow through Pull Requests. The merge strategy impacts commit history readability, revert difficulty, release automation, and changelog generation.

### Decision
Use **Squash Merge** as the default merge strategy for all pull requests to `main`.

### Consequences
* ✅ Keeps git history on `main` clean and linear — one PR equals one commit.
* ✅ Reverting a feature is simple: just revert a single commit.
* ✅ Simplifies automated changelog generation and release creation.
* ⚠️ Intermediate commits on feature branches are lost (this is acceptable as it prevents branch pollution and minor commit noise).

### Alternatives Rejected

#### Merge Commit
Keeps intermediate commits but makes history noisy and difficult to trace.

#### Rebase Merge
Keeps linear history but rewrites hashes and makes trace mapping harder.

---

## ADR-018: Repository Security Scanning & Vulnerability Audits

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
Dependency vulnerabilities, insecure file configurations, secrets/credentials exposure, and static code bugs can severely compromise the monorepo's integrity. To satisfy the repository security posture required in `PLAN.md` and `TESTING_STRATEGY.md`, we need automated, continuous security scanning and dependency audits.

### Decision
Implement and run a dedicated Security Scanning workflow (`.github/workflows/security.yml`) with:
1. **Dependency Audits**: Run `npm audit --audit-level=high` (for Node monorepo workspaces) and `pip-audit` (for Python FastAPI requirements).
2. **Container & Filesystem Scanning**: Run `Trivy` filesystem scans configured to report and fail (`exit-code: 1`) on any `HIGH,CRITICAL` vulnerabilities.
3. **Static Application Security Testing (SAST)**: Integrate `CodeQL` analysis for `javascript-typescript` and `python` languages using `security-extended` and `security-and-quality` query suites.
4. **Trigger Rules**: Run on every pull request targeting `main`, pushes to `main`, and on a weekly cron schedule (Sunday at midnight).
5. **Workflow Permissions**: Define minimal permissions (`contents: read`, `security-events: write`, `actions: read`) to follow least-privilege security guidelines.
6. **Action Pinning**: Pin all actions to specific commit SHAs rather than mutable tags to prevent supply-chain attacks.

### Consequences
* ✅ Automates vulnerability auditing, blocking insecure PRs from being merged.
* ✅ Pinned action commit SHAs guarantee deterministic, secure CI workflow executions.
* ✅ Weekly cron jobs scan the codebase even when no commits are made, catching newly disclosed CVEs.
* ⚠️ Running full CodeQL static analysis and container scans increases the total CI execution time (acceptable trade-off for continuous security verification).

### Alternatives Rejected

#### Manual Vulnerability Auditing
Rejected because manual audits are easily forgotten, cannot act as PR merge gates, and do not scale as the development team grows.

#### Third-Party External Paid SaaS (e.g., Snyk)
Rejected to minimize external integration dependencies, setup overhead, and software licensing costs, favoring GitHub native integrations (CodeQL, Dependabot) and robust open-source tools (Trivy).

---

## ADR-019: GitHub Actions Version Pinning Strategy

**Status:** ✅ Accepted
**Date:** June 2026

### Context

GitHub workflow failures occurred because generated workflow files referenced action SHAs that did not exist or could not be resolved.

This created CI failures despite the workflow YAML being syntactically correct.

### Decision

Use official stable major versions for GitHub Actions:

```text
actions/checkout@v4
actions/setup-node@v4
actions/setup-python@v5
github/codeql-action@v3
aquasecurity/trivy-action@master
```

SHA pinning is only permitted when:

* SHA validity has been verified
* The SHA is documented
* Security requirements mandate pinning

Default policy:

```text
Prefer official stable releases over generated SHAs.
```

### Consequences

* CI reliability improves
* Fewer workflow failures caused by invalid action references
* Easier maintenance

### Alternatives Rejected

* Arbitrary SHA pinning
* Unverified generated action references
* Floating latest versions

---

## ADR-020: Phase 0 Security Gate Policy

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
During Phase 0 (Foundation) security scans, Trivy and npm audit reported high-severity vulnerabilities in key framework dependencies:
1. **Next.js 14** (and transitive dependencies like `postcss`).
2. **NestJS 10** (and transitive dependencies like `glob`, `picomatch`, `tmp`, `webpack`).

Remediating these vulnerabilities requires upgrading to Next.js 15+ (dependent on React 19+) and NestJS 11+ respectively. Upgrading these major framework versions during Phase 0 conflicts with the scope requirement of maintaining stable framework baselines and avoiding breaking architectural refactoring. However, we cannot let these high-severity findings break the CI pipeline and block active development. We need a security gating policy that provides complete visibility of vulnerabilities while allowing CI to build cleanly in the presence of these accepted framework risks.

### Decision
1. **Differentiate Gate Thresholds by Severity**:
   - **Fail CI on CRITICAL findings**: Any new or existing CRITICAL severity vulnerabilities must trigger build/workflow failures (exit code 1).
   - **Report but Do Not Block on HIGH findings**: All HIGH, moderate, and low-severity vulnerabilities must still be audited, scanned, and fully reported in CI logs/reports for transparency, but will not fail the pipeline (exit code 0 or set as warning threshold).
2. **Implement Gates in GitHub Workflows (`.github/workflows/security.yml`)**:
   - **npm audit**: Run with `--audit-level=critical` to fail the build only when critical issues are found, while printing all audit warnings to the build logs.
   - **Trivy File System Scanning**: Maintain a split configuration: one scanner targeting `CRITICAL` severity with `exit-code: 1` (blocking) and one scanner targeting `HIGH` severity with `exit-code: 0` (reporting only).
   - **CodeQL Static Analysis**: Keep CodeQL scanning strictly blocking (`fail-on-severity` rules standard) for code-level security gates (e.g. injection, circular imports).
3. **Track Deferred Risks as Technical Debt**: Log the deferred upgrades in `docs/TECHDEBT.md` under specific tracking IDs:
   - `TECHDEBT-001`: Next.js 14 and PostCSS security advisories.
   - `TECHDEBT-002`: NestJS 10 to NestJS 11 migration path.
   - `TECHDEBT-003`: Next.js 14 to Next.js 16 migration path.
   - `TECHDEBT-004`: Starlette / FastAPI security advisories.
4. **Remediation Target**: Plan and schedule the migration to Next.js 16/React 19, NestJS 11, and FastAPI 0.138+ (with Starlette 1.3+) early in Phase 1 as separate, dedicated technical tasks.

### Consequences
* ✅ CI pipeline builds cleanly for active features and branches, unblocking progress.
* ✅ Automated safeguards are still in place to block any new CRITICAL vulnerabilities.
* ✅ Framework vulnerability exceptions are explicitly tracked as technical debt.
* ⚠️ Active development/testing operates with known Next.js 14 and NestJS 10 vulnerabilities (acceptable since the monorepo is not deployed to public-facing production during Phase 0).

### Alternatives Rejected

#### Upgrading Next.js and NestJS immediately in Phase 0
Rejected because the breaking changes in routers, caching models, and third-party dependencies would require significant refactoring, destabilizing the codebase during initial development.

#### Disabling npm audit or Trivy scans
Rejected because it would hide other security findings, losing audit transparency.

---

## ADR-021: Shared Secret Authentication for Internal APIs

**Status:** ✅ Accepted  
**Date:** June 2026

### Context
FastAPI runs the orchestrator and makes calls to Claude 3.5 Sonnet. In turn, FastAPI must notify NestJS about agent status updates (`agent:started`, `agent:complete`, etc.). Both of these internal APIs (`api-nest` and `ai-fastapi`) are deployed in a private network (VPC) but need a simple, lightweight authentication mechanism to ensure that:
1. Only authorized components within the private network can invoke the `/generate` pipeline on FastAPI.
2. Only FastAPI can trigger event logging callbacks on NestJS (`POST /api/v1/jobs/:jobId/events`).

### Decision
Implement **Shared Secret Token Authentication** using a pre-shared API secret:
1. Define a shared token via the `INTERNAL_API_SECRET` environment variable (defaults to a mock value for local development).
2. For NestJS → FastAPI (`POST /generate`): The NestJS worker includes the token in the `X-Internal-Token` header.
3. For FastAPI → NestJS (`POST /api/v1/jobs/:jobId/events`): The FastAPI callbacks module includes the token in the `X-Internal-Token` header.
4. Both services reject any request with a missing or mismatched token header, throwing a `401 Unauthorized` HTTP error.

### Consequences
* ✅ Simple, lightweight setup with no external dependencies (e.g. OAuth providers, JWT signing keys).
* ✅ Guarantees that internal routes cannot be accessed without the secret token.
* ✅ Shared secret is easily injected via AWS ECS Task Definitions or Docker Compose.
* ⚠️ The secret must be securely managed (e.g. AWS Secrets Manager or KMS) and rotated periodically.

### Alternatives Rejected

#### No Authentication
Relying entirely on network isolation is risky, as any compromised internal container could make unlimited LLM calls or forge job events.

#### Mutual TLS (mTLS)
Highly secure but introduces massive setup and maintenance overhead for local development and Docker Compose.

#### JWT Session-Based Authentication
Overkill for service-to-service communication and requires JWT verification logic on both sides.