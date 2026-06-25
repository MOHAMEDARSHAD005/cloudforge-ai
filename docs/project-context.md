# project-context.md
> Living document. Update whenever the project's scope, stack, constraints, users, or SLOs change.
> Last updated: June 2026 (v2.0)

---

## What The System Is

CloudForge AI is an **AI Platform Engineering Team** — not a chatbot, not a single-prompt wrapper, not a diagram generator.

Given a natural language prompt like:
> "Build a Netflix backend for 10 million users."

CloudForge AI simulates a Staff Engineer team via a pipeline of 8 specialized AI agents, producing a complete engineering deliverable package:

| Deliverable | Agent | Output Type |
|---|---|---|
| System architecture design | Architecture | `ArchitectureModel` |
| AWS service selection + justification | AWS Expert | `AwsArchitecture` |
| Multi-tier cost estimates (S/M/L) | Cost | `CostModel` |
| Security review report | Security | `SecurityReport` |
| HA + DR strategy | Architecture + AWS Expert | Embedded in outputs |
| Terraform IaC bundle | Terraform | `TerraformBundle` |
| Mermaid + C4 architecture diagrams | Diagram | `DiagramModel` |
| Architecture Decision Records | Planner | Embedded in `ProjectPlan` |
| Staff-level review with critique | Reviewer | `ReviewReport` |

---

## Why It Exists

Most engineers do not have access to a Staff-level AWS Solutions Architect when designing systems. CloudForge AI democratizes that expertise for:

- Solo developers and small teams designing production systems
- Students preparing for AWS certifications (SAA, SAP, DVA)
- Startup founders making early architecture decisions
- Backend engineers new to cloud infrastructure
- DevOps engineers evaluating AWS service tradeoffs

---

## The Agent Team

The system runs a **pipeline of 8 specialized agents** in dependency-ordered parallel waves.

```
Wave 1:  Planner
Wave 2:  Architecture + AWS Expert (parallel)
Wave 3:  Security + Cost + Diagram (parallel)
Wave 4:  Terraform (needs Wave 2 + Wave 3)
Wave 5:  Reviewer (needs all prior outputs)
```

| Agent | Responsibility | Output |
|---|---|---|
| Planner | Parse requirements, surface assumptions, create execution plan | `ProjectPlan` |
| Architecture | Component design, DB selection, caching, service boundaries, HA strategy | `ArchitectureModel` |
| AWS Expert | AWS service mapping, networking, scalability, HA + DR | `AwsArchitecture` |
| Security | IAM, encryption, secrets management, WAF, private networking | `SecurityReport` |
| Cost | Compute + DB + cache + storage + CDN cost estimates across three tiers | `CostModel` |
| Terraform | Generate `vpc.tf`, `ecs.tf`, `rds.tf`, `redis.tf`, `s3.tf` | `TerraformBundle` |
| Diagram | Mermaid + C4 architecture diagrams | `DiagramModel` |
| Reviewer | Staff-level review: SPOFs, missing HA, security gaps, cost anomalies, cross-agent consistency | `ReviewReport` |

---

## Current Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | React, TypeScript |
| Backend API | NestJS | REST + WebSocket (Socket.IO) |
| AI Engine | FastAPI + Pydantic AI | Agent orchestration, structured outputs |
| Database | PostgreSQL 16 | Via Prisma ORM |
| Queue | Redis 7 + BullMQ | Async job processing. Migrating to SQS in Phase 5. |
| Realtime | Socket.IO | Live agent progress updates via WebSocket |
| Logging | Winston (NestJS), structlog (FastAPI) | Structured JSON only. No `print()` statements. |
| Monorepo | Turborepo | Shared types via `packages/shared-types` |
| Containerization | Docker / Docker Compose | Local dev |
| Production (Phase 5) | AWS ECS Fargate | NestJS + FastAPI + Next.js as separate task definitions |

---

## Key Constraints

| Constraint | Detail |
|---|---|
| **AI Latency** | Multi-agent pipeline: 45–90 seconds per job. Fully async — no blocking HTTP. |
| **LLM Cost** | 6–8 LLM calls per job. Token usage tracked per agent. Capped per user. |
| **Structured Output** | Every agent returns a Pydantic-validated typed model. No raw text stored. |
| **Agent Reliability** | Agents can fail. System fails partial, not total. Reviewer always runs. |
| **Concurrency** | Max 2 concurrent jobs per user. Max 20 jobs/day (free tier). Queue mandatory. |
| **Terraform Correctness** | Generated Terraform passes `terraform validate` + `tflint` in CI. |
| **Prompt Versioning** | Prompts are versioned, immutable files. Changing a prompt = new version. |
| **Observability** | Every request carries `traceId`. Every job carries `jobId`. Every artifact stores provenance. Logs are structured JSON. |
| **Privacy** | FastAPI AI engine is internal-only. Never publicly exposed. All traffic within VPC. |
| **Idempotency** | Re-submitting a job with the same `jobId` returns existing artifacts. No duplicate LLM calls. |

---

## Service Level Objectives (SLOs)

> These are the targets the system is designed to meet. Revisit after 30 days of production traffic.

### Availability

| Environment | Target | Allowed Downtime / Month |
|---|---|---|
| Phase 1–4 (pre-prod) | 99.0% | ~7.2 hours |
| Phase 5 (AWS production launch) | 99.5% | ~3.6 hours |
| Phase 5+ (growth) | 99.9% | ~43 minutes |

### Success Rate

| Metric | Target |
|---|---|
| Job completion rate (full artifact set) | ≥ 95% |
| Job partial completion rate (at least Planner + Architecture) | ≥ 99% |
| Pydantic validation failure rate | < 1% |
| Terraform validate pass rate | ≥ 98% |
| Authentication success rate | ≥ 99.9% |

### P95 Latency

| Endpoint | P95 Target |
|---|---|
| `POST /api/v1/projects` (job creation) | < 200ms |
| `GET /api/v1/projects/:id` (read project) | < 100ms |
| `GET /api/v1/artifacts/:id` (read artifact) | < 100ms |
| First WebSocket event after job enqueued | < 5 seconds |
| Full job completion (wall-clock) | < 90 seconds |

### Queue Health

| Metric | Target |
|---|---|
| Queue depth (normal operation) | < 50 jobs |
| Queue depth (alert threshold) | > 100 jobs for > 5 minutes |
| Queue wait time (P95) | < 30 seconds |
| Worker pick-up time (job enqueued → worker starts) | < 10 seconds |

### Cost

| Metric | Target |
|---|---|
| Estimated cost per job (free tier user) | < $0.08 USD |
| Token budget per job | < 30,000 tokens total |
| Alert threshold | > 3× rolling 1-hour baseline token usage |

---

## Observability Requirements

Every system component must meet these minimum observability standards:

- **Every HTTP request**: structured log with `traceId`, `method`, `path`, `statusCode`, `durationMs`, `userId` (if authenticated)
- **Every job**: structured log with `traceId`, `jobId`, `userId`, `projectId`, `status`, `totalDurationMs`
- **Every agent execution**: structured log with `traceId`, `jobId`, `agent`, `durationMs`, `inputTokens`, `outputTokens`, `modelName`, `success`
- **Every artifact write**: structured log with `traceId`, `artifactId`, `projectId`, `type`, `schemaVersion`, `promptVersion`
- **Every error**: structured log with `traceId`, `level: "error"`, `message`, `stack`, `context`

No `console.log()` or `print()` statements in production code. All logs go through Winston (NestJS) or structlog (FastAPI).

---

## Operational Requirements

- **Zero-secrets-in-code**: No credentials in source files, Docker images, or CI logs. All secrets via AWS Secrets Manager.
- **Pinned dependencies**: All npm and pip packages pinned. Dependabot enabled. No `*` version ranges.
- **Pinned Docker images**: Base images pinned to digest, not floating tags.
- **`npm audit` + `pip-audit`** run in CI on every PR.
- **No production hotfixes**: All changes go through CI/CD. No direct SSH to production tasks.
- **Runbooks required**: Every alert has a linked runbook in `RUNBOOKS.md`.
- **GitOps-first workflow**: No direct commits to `main`. All changes must flow through Pull Requests.
- **Protected main branch**: Require status checks and code review before merge.
- **CODEOWNERS enforced**: Critical directories require designated reviewers.
- **Conventional commits required**: Enables changelog generation and release automation.
- **Dependabot enabled**: Weekly dependency updates.
- **Secret scanning enabled**: Push protection blocks credentials from entering repository history.
- **Repository environments**: `dev`, `staging`, and `prod` environments separated.
- **Semantic versioning**: Releases tagged using SemVer.
- **GitHub Actions required**: All builds, tests and deployments originate from CI/CD pipelines.
- **No force pushes to protected branches**.

---

## Scale Targets

| Metric | Phase 1–4 | Phase 5 Launch | Phase 5 Growth |
|---|---|---|---|
| Concurrent users | < 50 | 100–500 | 500–5,000 |
| Jobs per day | < 200 | ~1,000 | ~10,000 |
| Avg job duration | 45–90 seconds | 45–90 seconds | 45–90 seconds |
| Artifact size per job | ~50 KB JSON | ~50 KB JSON | ~50 KB JSON |
| PostgreSQL rows (artifacts) | < 10K | < 100K | < 1M |

---

## What This System Is NOT

- ❌ Not a chatbot
- ❌ Not a CRUD app
- ❌ Not a Mermaid diagram generator with an LLM wrapper
- ❌ Not a single-prompt application
- ❌ Not a LangChain demo
- ❌ Not Kubernetes-based (no service mesh, no sidecars, no pod orchestration)
- ❌ Not event-sourced (no CQRS, no event store, no Kafka)
- ❌ Not a microservices system (three services, modular monolith pattern within each)

---

## Non-Goals (Explicit)

The following are explicitly out of scope until stated otherwise:

| Non-Goal | Why |
|---|---|
| Real-time collaborative editing | Premature complexity for a 1–3 engineer team |
| Azure or GCP support | Post-v1. Trigger: user demand signals (OQ-010) |
| User-uploaded architecture documents | Post-v1. Requires multimodal pipeline (OQ-012) |
| Row-level security (RLS) in PostgreSQL | Post-v1. App-level ownership sufficient for Phase 1–4 (OQ-008) |
| Kubernetes | Operational complexity unjustified at this scale |
| Event sourcing / CQRS | Unnecessary complexity for this domain |
| Third-party LLM provider abstraction | Evaluate in Phase 2 based on cost/quality benchmarks (OQ-001) |
| Real Terraform plan execution (vs validate) | Post-v1. Sandboxed plan execution is a Phase 5+ concern (OQ-011) |

---

## Team & Context

| Attribute | Value |
|---|---|
| Team size | 1–3 engineers |
| Stage | Greenfield — building from scratch |
| Deployment target now | Docker / Docker Compose |
| Deployment target Phase 5 | AWS ECS Fargate |
| Primary cloud | AWS |
| Future clouds | Azure, GCP (post-v1.0) |
| Primary LLM provider | Anthropic (Claude) |
| Agent framework | Pydantic AI |

---

## Document Map

| Document | Purpose |
|---|---|
| `PLAN.md` | Engineering phases, tasks, exit criteria, acceptance criteria |
| `project-context.md` | This document — vision, stack, constraints, SLOs |
| `decisions.md` | Architecture Decision Records (ADRs) |
| `open-questions.md` | Unresolved decisions and active investigations |
| `docs/AGENTS.md` | Per-agent specifications, prompts, failure behavior |
| `docs/SEQUENCE.md` | Complete request lifecycle sequence diagrams |
| `docs/FAILURE_MATRIX.md` | Agent failure classification and fallback behavior |
| `docs/OBSERVABILITY.md` | Logging, metrics, tracing, dashboards, alerts |
| `docs/RUNBOOKS.md` | Operational runbooks for every alert |
| `docs/TESTING_STRATEGY.md` | Unit, integration, E2E, golden dataset, chaos tests |
| `docs/PROMPT_VERSIONING.md` | Prompt versioning policy and migration strategy |
| `VERSIONING.md` | App-level SemVer policy (major/minor/patch) for releases; root-level summary of prompt versioning rules |
| `TECHDEBT.md` | Accepted technical debt log: deferred CVEs/advisories, business justification, target remediation phase |
| `CONTRIBUTING.md` | Contributor workflow: branch naming, commit conventions, code safety/quality standards |
| `docs/DOCS_MAINTENANCE_AGENT.md` | Static vs. dynamic doc classification and the per-task doc-update procedure |
