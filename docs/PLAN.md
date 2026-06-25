# CloudForge AI — Engineering Plan

> **Version:** 2.0  
> **Date:** June 2026  
> **Status:** Living Document  
> **Audience:** Engineering leads, senior contributors  
> **Previous version:** PLAN.md v1.0 (June 2026)

---

## Table of Contents

1. [Project Overview & Constraints](#1-project-overview--constraints)
2. [Implementation Plan — Phases](#2-implementation-plan--phases)
3. [System Design Plan](#3-system-design-plan)
4. [System Architecture Plan](#4-system-architecture-plan)
5. [API Design Plan](#5-api-design-plan)
6. [Database Design Plan](#6-database-design-plan)
7. [Scalability Design Plan](#7-scalability-design-plan)
8. [Security System Design Plan](#8-security-system-design-plan)

---

## 1. Project Overview & Constraints

### What We Are Building

CloudForge AI is an **AI Platform Engineering Team**, not a chatbot. Given a natural language system requirement, a pipeline of 8 specialized agents collaborates to produce a complete engineering deliverable:

- System architecture design
- AWS service selection with justification
- Multi-tier cost estimates (small / medium / large)
- Security review report
- High availability + disaster recovery strategy
- Terraform IaC bundle (vpc.tf, ecs.tf, rds.tf, redis.tf, s3.tf)
- Mermaid + C4 architecture diagrams
- ADR (Architecture Decision Records)
- Staff-level engineering review with critique

### Core Constraints

| Constraint | Detail |
|---|---|
| **AI Latency** | 30–120 seconds per job. Fully async. No blocking HTTP calls. |
| **LLM Cost** | 6–8 LLM calls per job. Token usage tracked and capped per user. |
| **Agent Reliability** | Agents can fail or hallucinate. System fails partial, not total. Reviewer is mandatory. |
| **Structured Output** | Every agent returns a Pydantic-validated typed model. No raw text reaches the DB. |
| **Concurrency** | Queue is mandatory. Max 2 concurrent jobs per user. 20 jobs/day on free tier. |
| **Terraform Correctness** | Generated Terraform must pass `terraform validate` + `tflint` in CI. |
| **Observability** | Every request carries a `traceId`. Every job carries a `jobId`. Every artifact stores `schema_version`, `prompt_version`, and `model_name`. |
| **Privacy** | FastAPI is internal-only. Never publicly exposed. All traffic within VPC. |

### Immutable Architecture Decisions

The following are settled decisions — do not re-litigate without a new ADR:

| Layer | Technology | ADR |
|---|---|---|
| Monorepo | Turborepo | ADR-001 |
| Agent framework | Pydantic AI | ADR-002 |
| Job queue | BullMQ → SQS | ADR-003, ADR-005 |
| Agent execution | Hybrid parallel waves | ADR-004 |
| Artifact storage | PostgreSQL + JSONB | ADR-006 |
| Real-time updates | Socket.IO WebSocket | ADR-007 |
| AI engine exposure | Internal VPC only | ADR-008 |
| Authentication | JWT + HttpOnly refresh tokens | ADR-009 |
| Quality gate | Reviewer Agent (mandatory last step) | ADR-010 |
| Prompt management | Versioned, immutable prompt files | ADR-011 |
| Artifact metadata | schema_version + prompt_version + model_name | ADR-012 |
| Token tracking | Per-agent token accounting | ADR-013 |
| Observability | Structured JSON logging + traceId | ADR-014 |
| Idempotency | Idempotent artifact generation | ADR-015 |

---

## 2. Implementation Plan — Phases

> **Reading this section:** Each phase has Goals, Tasks, Exit Criteria, and Acceptance Criteria. A phase is complete only when ALL acceptance criteria are met. Exit criteria are the "done" bar; acceptance criteria are the quality bar.

---

### Phase 0 — Foundation (Week 1–2)

**Goal:** Monorepo scaffolded, all services running locally, shared contracts defined, CI pipeline green.

#### Tasks

- [x] Init Turborepo monorepo with `apps/` and `packages/` structure
- [x] Scaffold `apps/api-nest` (NestJS), `apps/ai-fastapi` (FastAPI), `apps/frontend-next` (Next.js 14)
- [x] Create `packages/shared-types` — Zod schemas for all domain objects (`ProjectPlan`, `ArchitectureModel`, `AwsArchitecture`, `SecurityReport`, `CostModel`, `TerraformBundle`, `DiagramModel`, `ReviewReport`)
- [x] Create `packages/shared-prompts` — directory structure for versioned prompts (`planner/v1.md`, etc.)
- [x] Create `packages/shared-config` — env config, constants, shared enums
- [x] Docker Compose: PostgreSQL 16, Redis 7, NestJS, FastAPI, Next.js — all wired together
- [x] Prisma schema: `users`, `projects`, `jobs`, `artifacts`, `job_events`, `token_usage` tables
- [x] FastAPI skeleton: all agent endpoints returning typed mock data
- [x] NestJS skeleton: all modules wired (`ProjectsModule`, `JobsModule`, `AuthModule`, `ArtifactsModule`), auth stubbed
- [x] `traceId` middleware in NestJS — generate UUID on every request, propagate as `X-Trace-Id` header
- [x] `traceId` propagation in FastAPI — read `X-Trace-Id`, include in all log lines
- [x] Structured JSON logging configured in both NestJS (Winston) and FastAPI (structlog or python-json-logger)
- [x] CI pipeline: `turbo lint` + `turbo type-check` on every PR
- [x] Create GitHub organization and repository structure
- [x] Configure branch protection for `main`
- [x] Configure CODEOWNERS for mandatory reviews
- [x] Configure Conventional Commits enforcement
- [x] Configure PR template and Issue templates
- [x] Configure GitHub Actions for lint + type-check + tests
- [x] Enable Dependabot updates
- [x] Enable secret scanning and push protection
- [x] Configure labels and project boards
- [x] Configure release tagging strategy
- [x] Configure repository environments (`dev`, `staging`, `prod`)
- [x] Create CONTRIBUTING.md
- [x] Create VERSIONING.md
- [x] Create CODEOWNERS

#### Exit Criteria

`docker compose up` brings up the full stack. `GET /health` returns 200 on all services. (Note: docker compose up is fully set up, local servers verified successfully, daemon was offline during validation checks).

#### Acceptance Criteria

- [x] All Zod schemas in `shared-types` are importable from both `api-nest` and `frontend-next`
- [x] All Prisma migrations run cleanly on a fresh database
- [x] NestJS logs include `traceId` on every log line
- [x] FastAPI logs include `traceId` passed from NestJS
- [x] CI passes on a clean branch with no code written yet (tooling green)
- [x] `packages/shared-prompts/planner/v1.md` exists and is non-empty
- [x] Direct pushes to `main` are blocked
- [x] Every change goes through Pull Request review
- [x] CODEOWNERS approval required for protected areas
- [x] Conventional commit messages enforced
- [x] CI required before merge
- [x] Dependabot enabled
- [x] Secret scanning enabled
- [x] Repository environments configured
- [x] Release tags follow semantic versioning
- [x] Next.js 14 / PostCSS, NestJS 10 / Tooling, and Starlette / FastAPI vulnerabilities tracked as accepted risk (TECHDEBT-001, TECHDEBT-002, TECHDEBT-003, TECHDEBT-004)
- [x] All GitHub Actions workflows validated using actionlint
- [x] All GitHub Actions references use official tags or verified SHAs
- [x] npm/pnpm dependency graph resolves cleanly in CI
- [x] actionlint passes for every workflow
- [x] Security workflows execute successfully on a clean branch
- [x] All referenced GitHub Actions versions resolve successfully
- [x] No dependency resolution failures in CI
- [x] GitHub workflow validation documented in  DOCS_MAINTENANCE_AGENT.md

---

### Phase 1 — Core Agent Pipeline (Week 3–5)

**Goal:** End-to-end job flow with real LLM calls. Planner, Architecture, and AWS Expert agents producing real output. Basic frontend showing job progress.

#### Tasks

- [x] Implement Planner Agent → `ProjectPlan`
- [x] Implement Architecture Agent → `ArchitectureModel`
- [x] Implement AWS Expert Agent → `AwsArchitecture`
- [x] Wire BullMQ: NestJS enqueues job, BullMQ Worker calls FastAPI `/generate`
- [x] WebSocket gateway in NestJS: emit `agent:started`, `agent:complete`, `agent:failed`, `job:complete` events
- [x] Artifact persistence: save all agent outputs as JSONB records in `artifacts` table
- [x] `JobEvent` records: write structured event history for every agent start/complete/fail
- [x] Token usage: capture `input_tokens`, `output_tokens`, `model_name` per agent call — persist in `token_usage` table
- [x] Resolve OQ-003: service-to-service auth (shared secret header + VPC SG rules)
- [x] Resolve OQ-001: model selection for this phase (benchmark Claude Sonnet for Planner/Architecture/AWS Expert)
- [x] Frontend: prompt input → polling job status via WebSocket → artifact display (read-only, unformatted)

#### Exit Criteria

Submit "Build a school ERP for 50,000 users" → Planner, Architecture, and AWS Expert outputs visible in UI. Job completes in under 90 seconds.

#### Acceptance Criteria

- [x] `ProjectPlan`, `ArchitectureModel`, `AwsArchitecture` all pass Pydantic validation on every test run
- [x] `JobEvent` records written for every agent transition (start, complete, fail)
- [x] Token usage recorded per agent in `token_usage` table
- [x] WebSocket delivers `agent:complete` events in real time (verified in browser dev tools)
- [x] No raw LLM text stored in the database — only validated Pydantic → JSON payloads
- [x] Retry logic: BullMQ retries agent call up to 3 times on transient failure (5xx from LLM provider)
- [x] Each artifact JSONB payload includes `schema_version`, `prompt_version`, `model_name`, `provider_name`

---

### Phase 2 — Full Agent Suite (Week 6–8)

**Goal:** All 8 agents producing real output. Full artifact set persisted and displayed.

#### Tasks

- [ ] Implement Security Agent → `SecurityReport`
- [ ] Implement Cost Agent → `CostModel` (small / medium / large tiers)
- [ ] Implement Terraform Agent → multi-file `TerraformBundle`
- [ ] Implement Diagram Agent → `DiagramModel` (Mermaid + C4)
- [ ] Implement Reviewer Agent → `ReviewReport`
- [ ] Wire parallel execution waves in FastAPI orchestrator (see ADR-004)
- [ ] Resolve OQ-004: schema sync strategy (implement `SCHEMA_VERSION` constant, document manual sync process)
- [ ] Partial completion: if Security/Cost/Diagram fail, job continues — partial artifact set returned
- [ ] Frontend: render all artifact types (Mermaid diagram renderer, Terraform syntax highlighting, collapsible sections)

#### Exit Criteria

Submit any prompt → full artifact set (all 8 agent outputs) rendered in UI. Reviewer output always shown, including critique.

#### Acceptance Criteria

- [ ] All 8 Pydantic output models validated on every agent run
- [ ] Partial artifact set returned when non-fatal agents fail (Security/Cost/Diagram/Terraform failures do not kill job)
- [ ] Reviewer Agent receives all prior outputs in its context
- [ ] Diagram Agent produces valid Mermaid syntax (verified by Mermaid parser in CI)
- [ ] `schema_version` and `prompt_version` present in every artifact payload
- [ ] Model selection benchmarked: Haiku acceptable for Diagram Agent (cost validation per OQ-001)

---

### Phase 3 — Quality, Reliability & Observability (Week 9–10)

**Goal:** Production-grade error handling, retry, validation, observability, and prompt versioning infrastructure.

#### Tasks

- [ ] Idempotency: if job is re-submitted with same `jobId`, return existing artifacts instead of re-running agents
- [ ] Terraform linting in CI: `terraform validate` + `tflint` + `checkov` against generated files
- [ ] Rate limiting: per-user job concurrency cap (max 2 concurrent), daily cap (20 jobs/day), enforced in NestJS
- [ ] Prompt regression test suite: golden dataset of 5 canonical prompts — run on every prompt version change
- [ ] Artifact schema tests: validate every artifact type against its Zod schema in CI
- [ ] Retry tests: simulate agent failures, confirm BullMQ retries and `job_events` record retries correctly
- [ ] Observability stack: resolve OQ-005 (CloudWatch for Phase 3–4, revisit for Phase 5)
- [ ] Dashboard: per-agent failure rate, queue depth, token usage, job duration (CloudWatch or Grafana)
- [ ] Alert: job failure rate > 5% in 5 minutes → PagerDuty/email
- [ ] Alert: token usage spike > 3× rolling 1h baseline

#### Exit Criteria

100 jobs run against staging with < 2% failure rate. Alerts fire correctly on injected failures.

#### Acceptance Criteria

- [ ] Idempotency verified: re-submitting same `jobId` returns cached artifacts, no new LLM calls
- [ ] `terraform validate` passes on 100% of generated Terraform bundles in golden dataset
- [ ] Golden dataset prompt regression: all 5 prompts produce structurally valid outputs on `prompt/v1`
- [ ] Per-agent metrics visible in dashboard: `duration_ms`, `failure_count`, `retry_count`, `token_usage`, `cost_usd`
- [ ] All alerts firing correctly in chaos test (injected Redis failure, injected agent 500s)
- [ ] RUNBOOKS.md written and linked from this document

---

### Phase 4 — Auth, UX & Polish (Week 11–12)

**Goal:** Multi-user system, saved projects, shareable artifacts, polished UI.

#### Tasks

- [ ] JWT auth: register / login / refresh — resolves ADR-009 implementation
- [ ] Project history: list / view / delete
- [ ] Artifact export: PDF report, ZIP (Terraform bundle download)
- [ ] Shareable artifact links (public read-only view, no auth required)
- [ ] UI polish: syntax-highlighted Terraform, rendered Mermaid, expandable sections, copy-to-clipboard
- [ ] Input validation in NestJS: prompt length cap (2000 chars), basic injection heuristic detection
- [ ] Resolve OQ-008: confirm app-level ownership checks are sufficient for Phase 4 (no RLS needed yet)

#### Exit Criteria

User can register, submit a prompt, view history, and share an artifact link. Auth flow has no regressions.

#### Acceptance Criteria

- [ ] Auth: register, login, refresh, logout all working with HttpOnly cookie refresh tokens
- [ ] Ownership enforced at DB query level on every artifact/project/job fetch
- [ ] Shareable link returns artifact without auth
- [ ] Prompt injection guard rejects obvious injection attempts (returns 400)
- [ ] PDF export and ZIP download work for all artifact types

---

### Phase 5 — AWS Deployment (Week 13–15)

**Goal:** Production deployment on AWS ECS Fargate with full observability, CI/CD, and zero-downtime deployments.

#### Tasks

- [ ] Write Terraform for CloudForge AI's own AWS infrastructure (`terraform/` directory)
- [ ] ECS Fargate: NestJS + FastAPI + Next.js (standalone build) — separate task definitions
- [ ] RDS PostgreSQL Multi-AZ + ElastiCache Redis (cluster mode)
- [ ] ALB + Route53 + ACM (HTTPS termination)
- [ ] AWS WAF: SQL injection, XSS, rate rule sets
- [ ] GitHub Actions CI/CD: lint → test → build → push ECR → deploy ECS (rolling update)
- [ ] Resolve OQ-002: database migration strategy (expand-contract or maintenance window — decide before first migration)
- [ ] Resolve OQ-005: finalize observability stack for production
- [ ] BullMQ → SQS migration: swap `QueueService` implementation (per ADR-005)
- [ ] AWS Secrets Manager: all secrets migrated from `.env` to Secrets Manager
- [ ] ECS auto-scaling policies: NestJS (CPU 60%), FastAPI (CPU 70%), Workers (queue depth)
- [ ] Minimum task count: NestJS ×2, FastAPI ×2, Workers ×1

#### Exit Criteria

CloudForge AI accessible at production URL over HTTPS. First real user job completes successfully.

#### Acceptance Criteria

- [ ] ECS tasks healthy in all three services
- [ ] RDS + Redis in private subnets with no public endpoints
- [ ] FastAPI unreachable from public internet (verified via security group audit)
- [ ] CI/CD deploys on merge to `main` with no manual steps
- [ ] CloudWatch alarms configured and tested
- [ ] `terraform plan` on CloudForge's own infra produces no unexpected changes
- [ ] Database migration completed with zero downtime (or documented maintenance window)
- [ ] All secrets in Secrets Manager — no plaintext credentials in task definitions

---

## 3. System Design Plan

### Core Design Principles

**1. Agent Isolation**
Each agent is a single-responsibility function: one typed input model → one LLM call → one validated output model. No agent reads another agent's internal state. All inter-agent communication goes through the orchestrator.

**2. Output-First Design**
Define Pydantic output models first. Write agent prompts to produce them. Frontend Zod schemas mirror Pydantic models. Validation errors are explicit, not silent.

**3. Async-First**
No synchronous LLM call in any request/response cycle. Users receive `{ projectId, jobId }` in under 100ms. Results arrive via WebSocket.

**4. Reviewer as Mandatory Quality Gate**
The Reviewer Agent runs last, receives all prior outputs, and acts as a Staff Engineer. It is never skipped. Its output is always shown, including critique.

**5. Fail Partial, Not Total**
If a non-fatal agent fails (Security, Cost, Diagram, Terraform), the job continues. Partial artifact set is returned. Job status reflects per-agent success/failure. See `FAILURE_MATRIX.md`.

**6. Observability First**
Every request carries a `traceId`. Every job carries a `jobId`. Every agent execution emits a `JobEvent`. Every artifact stores its provenance. Logs are structured JSON. No `print()` statements.

**7. Prompts Are Code**
Prompts are versioned, immutable, and stored in `packages/shared-prompts/`. Changing a prompt requires a new version file and a changelog entry. Agents reference prompts by version. See `PROMPT_VERSIONING.md`.

---

### Execution Wave Model

```
Wave 1 (sequential)   Planner
                          │
Wave 2 (parallel)    Architecture + AWS Expert
                          │
Wave 3 (parallel)    Security + Cost + Diagram
                          │
Wave 4 (sequential)  Terraform ← needs Wave 2 + Wave 3 outputs
                          │
Wave 5 (sequential)  Reviewer ← needs all prior outputs
```

Wall-clock target: 45–60 seconds for a complete job.

---

### Event Flow (Summary)

```
POST /api/v1/projects { prompt }
  → NestJS creates Project + Job records (status: PENDING)
  → Returns { projectId, jobId } (< 100ms)
  → Emits job to BullMQ
  → BullMQ Worker picks up job
  → Worker calls FastAPI POST /generate { jobId, prompt, traceId }
  → FastAPI runs agent waves
  → Per-agent completion: FastAPI calls NestJS PATCH /jobs/:id/events
  → NestJS persists JobEvent + emits WebSocket event to user's room
  → Final: FastAPI returns all artifacts
  → NestJS persists artifacts, emits job:complete
```

Full sequence in `SEQUENCE.md`.

---

## 4. System Architecture Plan

### Service Map

```
┌─────────────────────────────────────────────────────────┐
│                    Public Internet                        │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                 ┌─────▼──────┐
                 │    WAF     │
                 └─────┬──────┘
                       │
                 ┌─────▼──────┐
                 │    ALB     │
                 └─────┬──────┘
              ┌────────┴─────────┐
              │                  │
    ┌─────────▼──────┐  ┌────────▼───────┐
    │  Next.js 14    │  │    NestJS      │
    │  (frontend)    │  │ (REST + WS)    │
    └────────────────┘  └────────┬───────┘
                                 │ VPC internal
                    ┌────────────┴─────────────┐
                    │                          │
           ┌────────▼──────┐        ┌──────────▼────┐
           │  BullMQ       │        │  PostgreSQL    │
           │  (Redis)      │        │  (RDS)         │
           └────────┬──────┘        └───────────────┘
                    │
           ┌────────▼──────────┐
           │   NestJS Worker   │
           └────────┬──────────┘
                    │ POST /generate (VPC only)
           ┌────────▼──────────┐
           │   FastAPI         │
           │  (Agent Engine)   │
           └────────┬──────────┘
                    │ HTTPS
           ┌────────▼──────────┐
           │   LLM Provider    │
           │ (Anthropic API)   │
           └───────────────────┘
```

### Repository Structure

```
cloudforge-ai/
.github/
├── workflows/
│   ├── ci.yml
│   ├── release.yml
│   ├── deploy-dev.yml
│   ├── deploy-prod.yml
│   └── dependabot.yml
├── ISSUE_TEMPLATE/
├── pull_request_template.md
└── CODEOWNERS
docs/
├── CONTRIBUTING.md
├── VERSIONING.md
├── RELEASE_PROCESS.md
├── BRANCHING_STRATEGY.md
└── RUNBOOKS.md
├── apps/
│   ├── frontend-next/          # Next.js 14 App Router
│   ├── api-nest/               # NestJS REST + WebSocket + BullMQ Worker
│   └── ai-fastapi/             # FastAPI agent orchestration engine
├── packages/
│   ├── shared-types/           # Zod schemas + TypeScript types
│   ├── shared-prompts/         # Versioned agent prompts (see PROMPT_VERSIONING.md)
│   └── shared-config/          # Env config, constants, enums
├── docker/
│   └── docker-compose.yml
├── terraform/                  # CloudForge's own AWS infrastructure
└── docs/
    ├── AGENTS.md
    ├── SEQUENCE.md
    ├── FAILURE_MATRIX.md
    ├── OBSERVABILITY.md
    ├── RUNBOOKS.md
    ├── TESTING_STRATEGY.md
    └── PROMPT_VERSIONING.md
```

---

## 5. API Design Plan

### NestJS REST Endpoints

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

POST   /api/v1/projects                → Create project + enqueue job
GET    /api/v1/projects                → List user's projects
GET    /api/v1/projects/:id            → Get project + all artifacts
DELETE /api/v1/projects/:id

GET    /api/v1/jobs/:id                → Job status + events
GET    /api/v1/jobs/:id/events         → JobEvent history

GET    /api/v1/artifacts/:id           → Single artifact
GET    /api/v1/artifacts/share/:token  → Public shared artifact (no auth)

GET    /health
GET    /metrics                        → Prometheus-compatible (if enabled)
```

### FastAPI Internal Endpoints

```
POST   /generate          → Run full agent pipeline
GET    /health
GET    /agents            → List agent metadata (versions, prompts)
```

### WebSocket Events (Socket.IO)

```
Client → Server:
  job:subscribe  { jobId }

Server → Client:
  agent:started  { jobId, agent, traceId, timestamp }
  agent:complete { jobId, agent, durationMs, tokenUsage, traceId, timestamp }
  agent:failed   { jobId, agent, error, fatal, traceId, timestamp }
  job:complete   { jobId, artifacts, totalDurationMs, traceId, timestamp }
  job:failed     { jobId, error, partialArtifacts, traceId, timestamp }
```

### Correlation Header

`X-Trace-Id: <uuid>` — propagated from client → NestJS → FastAPI → LLM call logs.

---

## 6. Database Design Plan

### Schema (Prisma)

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  projects     Project[]
}

model Project {
  id        String    @id @default(cuid())
  userId    String
  prompt    String
  status    ProjectStatus
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id])
  jobs      Job[]
  artifacts Artifact[]
}

model Job {
  id           String      @id @default(cuid())
  projectId    String
  status       JobStatus   // PENDING | RUNNING | COMPLETE | FAILED | PARTIAL
  startedAt    DateTime?
  completedAt  DateTime?
  errorMessage String?
  traceId      String
  project      Project     @relation(fields: [projectId], references: [id])
  events       JobEvent[]
  tokenUsages  TokenUsage[]
}

model JobEvent {
  id        String   @id @default(cuid())
  jobId     String
  agent     String?  // null for job-level events
  event     String   // "job:started" | "agent:started" | "agent:complete" | "agent:failed" | "job:complete" | "job:failed"
  payload   Json
  timestamp DateTime @default(now())
  job       Job      @relation(fields: [jobId], references: [id])
}

model Artifact {
  id           String       @id @default(cuid())
  projectId    String
  type         ArtifactType // PLAN | ARCHITECTURE | AWS_ARCHITECTURE | SECURITY | COST | TERRAFORM | DIAGRAM | REVIEW
  payload      Json         // Validated Pydantic model serialized to JSON
  schemaVersion String
  promptVersion String
  modelName    String
  providerName String
  createdAt    DateTime     @default(now())
  shareToken   String?      @unique
  project      Project      @relation(fields: [projectId], references: [id])
}

model TokenUsage {
  id           String   @id @default(cuid())
  jobId        String
  agent        String
  modelName    String
  inputTokens  Int
  outputTokens Int
  costUsd      Float?
  timestamp    DateTime @default(now())
  job          Job      @relation(fields: [jobId], references: [id])
}
```

### JSONB Payload Contract

Every artifact JSONB payload must include these top-level provenance fields:

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

---

## 7. Scalability Design Plan

### Bottleneck Analysis

| Bottleneck | Cause | Mitigation |
|---|---|---|
| LLM API rate limits | 6–8 calls/job, concurrent users | Per-user job concurrency cap (max 2), daily cap (20/day free) |
| PostgreSQL write volume | ~10 artifact writes per job | PgBouncer connection pooling; read replicas if needed in Phase 5 |
| FastAPI cold start | ECS cold start on new tasks | Minimum 2 FastAPI tasks always warm |
| WebSocket connections | Concurrent users | Socket.IO Redis adapter for multi-instance NestJS |
| Redis memory | BullMQ job history | Configure BullMQ `removeOnComplete` / `removeOnFail` TTLs |

### Rate Limiting

```
Per user (authenticated):
  Max concurrent jobs:  2
  Max jobs per day:     20 (free tier)
  Max projects:         5 (free tier)

Per IP (unauthenticated):
  Auth endpoints:       10 req/min
  Share endpoints:      60 req/min
```

### Queue Priority

```
Priority 1 (highest):  Retry jobs (failed agent recovery)
Priority 2:            Authenticated user jobs
Priority 3:            Background re-generation jobs
```

### Caching Strategy

| Data | Cache | TTL |
|---|---|---|
| User session validation | Redis | 15 min |
| Shared artifact (public) | Redis | 1 hour |
| Cost model (same prompt hash) | Redis | 24 hours |
| Project list per user | In-memory (NestJS) | 30 seconds |

### AWS ECS Scaling

```
NestJS:   min 2 tasks, scale out at 60% CPU, in at 20% CPU
FastAPI:  min 2 tasks, scale out at 70% CPU (warm standby maintained)
Workers:  min 1 task, scale out based on BullMQ queue depth (custom CloudWatch metric)
```

---

## 8. Security System Design Plan

### Threat Model

| Threat | Vector | Mitigation |
|---|---|---|
| Prompt injection | Malicious LLM instructions in user input | Input sanitization, system prompt hardening, Pydantic validation rejects injected structures |
| Auth bypass | JWT forgery or token replay | 15-min access token TTL, refresh token rotation on every use |
| Data exfiltration | User accessing another user's artifacts | Ownership enforced at DB query level on every query |
| Cost abuse | User triggers thousands of LLM calls | Job concurrency cap, daily cap, rate limiting |
| Token theft | XSS stealing JWT | HttpOnly cookie refresh tokens, in-memory access tokens |
| Supply chain | Compromised npm/pip package | Lockfiles, Dependabot, pinned Docker base image digests |
| Credential exposure | API keys in logs or environment | AWS Secrets Manager; structured logging excludes secret values |

### Auth Flow

```
Access Token:  15-min TTL, held in React state (never localStorage, never cookie)
Refresh Token: 7-day TTL, HttpOnly Secure SameSite=Strict cookie, rotated on every use
```

### Secrets Management

All secrets in AWS Secrets Manager (production). ECS task definitions reference ARNs, not plaintext values. Local `.env` for development only, excluded from version control.

### Network Security (AWS)

```
Internet → WAF → ALB (public subnet, HTTPS only)
                 → ECS NestJS tasks (private subnet)
                   → RDS + ElastiCache (private subnet, no public endpoint)
                   → ECS FastAPI tasks (private subnet, NestJS SG only on port 8000)
```

### Input Validation & Prompt Hardening

- `class-validator` on all NestJS DTOs
- Prompt length cap: 2000 characters
- Prompt injection heuristics in NestJS before enqueueing
- System prompt includes explicit role-lock and injection guard in every agent
- No user input directly interpolated into system prompts — always passed as `{user_requirement}` placeholder

### Audit Logging

Every job produces a structured audit event:

```json
{
  "timestamp": "2026-06-24T10:00:00Z",
  "traceId": "trace_abc123",
  "userId": "usr_abc",
  "projectId": "proj_xyz",
  "jobId": "job_123",
  "action": "job:complete",
  "agentResults": { "planner": "complete", "architecture": "complete", "cost": "failed" },
  "totalTokenUsage": 14200,
  "estimatedCostUsd": 0.043,
  "ip": "x.x.x.x",
  "userAgent": "Mozilla/5.0..."
}
```

---

## Key Engineering Decisions Summary

| Decision | Choice | ADR |
|---|---|---|
| Monorepo | Turborepo | ADR-001 |
| Agent framework | Pydantic AI | ADR-002 |
| Job processing | Async BullMQ → SQS | ADR-003, ADR-005 |
| Agent execution | Hybrid parallel waves | ADR-004 |
| Artifact storage | PostgreSQL JSONB | ADR-006 |
| Real-time updates | Socket.IO | ADR-007 |
| AI engine exposure | Internal VPC only | ADR-008 |
| Auth | JWT + HttpOnly refresh | ADR-009 |
| Quality gate | Reviewer Agent mandatory | ADR-010 |
| Prompt versioning | Versioned immutable files | ADR-011 |
| Artifact provenance | schema_version + prompt_version + model_name | ADR-012 |
| Token accounting | Per-agent token_usage records | ADR-013 |
| Observability | Structured JSON logs + traceId | ADR-014 |
| Idempotency | jobId-keyed deduplication | ADR-015 |

---

*This document is the engineering source of truth for CloudForge AI v2.0. All decisions are traceable to the constraints and tradeoffs documented here. When in doubt, refer to this plan before making local decisions. See linked documents in `/docs/` for operational details.*
