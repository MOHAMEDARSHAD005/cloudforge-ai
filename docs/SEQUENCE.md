# SEQUENCE.md
> Complete request lifecycle documentation for CloudForge AI.
> Covers the full flow from user input to artifact display, including error paths, retries, and trace propagation.
> Last updated: June 2026

---

## Overview

A CloudForge AI generation job passes through 5 layers:

```
User (Browser)
    ↓ POST /api/v1/projects
NestJS (REST API + WebSocket Gateway)
    ↓ BullMQ enqueue
BullMQ Worker (within NestJS process)
    ↓ POST /generate (VPC internal)
FastAPI (Agent Orchestration Engine)
    ↓ Anthropic API calls
LLM Provider (Anthropic Claude)
    ↑ Validated Pydantic models
FastAPI
    ↑ Artifact payloads
NestJS Worker → PostgreSQL (persist artifacts)
    ↑ WebSocket events
User (Browser — live progress UI)
```

---

## Phase 1: Job Creation

### Request Flow

```
User Browser
│
│  POST /api/v1/projects
│  { prompt: "Build a Netflix backend for 10M users" }
│  Authorization: Bearer <access_token>
│
▼
NestJS AuthGuard
│  Validate JWT access token
│  Extract { userId }
│
▼
NestJS ProjectsController
│
│  1. Validate prompt (class-validator, max 2000 chars)
│  2. Check user concurrency cap (max 2 active jobs)
│  3. Check daily job limit (max 20/day free tier)
│
│  If validation fails:
│    → 400 Bad Request { error: "VALIDATION_FAILED", details: [...] }
│  If concurrency exceeded:
│    → 429 Too Many Requests { error: "CONCURRENCY_LIMIT" }
│  If daily limit exceeded:
│    → 429 Too Many Requests { error: "DAILY_LIMIT_EXCEEDED" }
│
▼
NestJS ProjectsService
│
│  1. Create Project record (status: PENDING)
│     { id: "proj_abc", userId, prompt, status: "PENDING" }
│  2. Create Job record
│     { id: "job_xyz", projectId, status: "PENDING", traceId: "trace_123" }
│  3. Write JobEvent: { jobId, event: "job:created", payload: { userId, prompt } }
│
▼
NestJS QueueService
│
│  Enqueue BullMQ job:
│  { jobId: "job_xyz", projectId: "proj_abc", userId, prompt, traceId: "trace_123" }
│
▼
NestJS ProjectsController
│
│  Response (< 100ms):
│  201 Created
│  { projectId: "proj_abc", jobId: "job_xyz", traceId: "trace_123" }
│
▼
User Browser
│  Receives { projectId, jobId, traceId }
│  Connects WebSocket: socket.emit('job:subscribe', { jobId: "job_xyz" })
│  Shows "Initializing..." progress UI
```

---

## Phase 2: BullMQ Worker Pickup

```
BullMQ Queue (Redis)
│
│  Job dequeued by Worker (within NestJS process)
│  Concurrency: 1 job per worker instance
│  Priority: authenticated user jobs = Priority 2
│
▼
NestJS BullMQ Worker
│
│  1. Update Job record: status → RUNNING, startedAt = now()
│  2. Write JobEvent: { event: "job:started" }
│  3. Emit WebSocket: { event: "agent:started", agent: "pipeline", jobId }
│
▼
NestJS BullMQ Worker
│
│  POST http://ai-service.internal:8000/generate   (VPC internal only)
│  Headers:
│    X-Internal-Token: <shared_secret>
│    X-Trace-Id: trace_123
│  Body:
│    {
│      job_id: "job_xyz",
│      project_id: "proj_abc",
│      prompt: "Build a Netflix backend...",
│      trace_id: "trace_123",
│      agent_config: { ...AGENT_DEFAULTS }
│    }
│
▼
FastAPI (Agent Orchestration Engine)
│  Request received, traceId extracted
│  All subsequent log lines include traceId
│
│  Idempotency check:
│    SELECT * FROM artifacts WHERE project_id = 'proj_abc' AND status = 'COMPLETE'
│    If all 8 artifact types exist → return cached artifacts (no LLM calls)
│    If partial or none → proceed with generation
```

---

## Phase 3: Agent Execution Waves

### Wave 1: Planner (Sequential)

```
FastAPI Orchestrator
│
│  Call Planner Agent:
│    model: claude-sonnet-4-6
│    system_prompt: load('packages/shared-prompts/planner/v1.md')
│    user_content: { requirement: prompt, scale_hints: [...] }
│    max_tokens: 2000
│
▼
Anthropic API
│  Response: { content: [...], usage: { input_tokens: 487, output_tokens: 1243 } }
│
▼
FastAPI Orchestrator
│
│  1. Parse response → Pydantic ProjectPlan
│  2. If ValidationError → retry (up to 3x, backoff: 2s → 4s → 8s)
│  3. If still fails → raise FatalAgentError
│
│  On success:
│  4. Write TokenUsage: { jobId, agent: "planner", inputTokens: 487, outputTokens: 1243, costUsd: ... }
│  5. POST /api/v1/jobs/job_xyz/events (NestJS internal callback):
│     { event: "agent:complete", agent: "planner", durationMs: 9420 }
│
▼
NestJS (receives event callback)
│
│  1. Write JobEvent record
│  2. Persist Artifact: type=PLAN, payload=ProjectPlan JSON
│  3. Emit WebSocket to user's room:
│     { event: "agent:complete", agent: "planner", durationMs: 9420, jobId: "job_xyz" }
│
▼
User Browser
│  Progress UI updates: "✅ Planner complete (9.4s)"
```

### Wave 2: Architecture + AWS Expert (Parallel)

```
FastAPI Orchestrator
│
│  asyncio.gather(
│    architecture_agent(plan=ProjectPlan),
│    aws_expert_agent(plan=ProjectPlan)
│  )
│
├─────────────────────────────────────┐
│                                     │
Architecture Agent                   AWS Expert Agent
│                                     │
│  Anthropic API call                 │  Anthropic API call
│  (parallel, ~12s each)              │  (parallel, ~12s each)
│                                     │
│  → ArchitectureModel                │  → AwsArchitecture
│  → Write TokenUsage                 │  → Write TokenUsage
│  → Callback to NestJS               │  → Callback to NestJS
│  → Persist artifact                 │  → Persist artifact
│  → WebSocket emit                   │  → WebSocket emit
│                                     │
└──────────────── ▼ ─────────────────┘
│
FastAPI Orchestrator
│  Both outputs collected
│  Wall-clock time for Wave 2: ~12–20s (parallel, not additive)
```

### Wave 3: Security + Cost + Diagram (Parallel)

```
FastAPI Orchestrator
│
│  asyncio.gather(
│    security_agent(plan, architecture, aws_architecture),
│    cost_agent(plan, aws_architecture),
│    diagram_agent(plan, architecture, aws_architecture)
│  )
│
├─────────────┬─────────────────────────┐
│             │                         │
Security     Cost                    Diagram
│             │                         │
│  Non-fatal  │  Non-fatal              │  Non-fatal
│  (continue  │  (continue              │  (continue
│   on fail)  │   on fail)              │   on fail)
│             │                         │
└──────┬──────┴───────────┬─────────────┘
       │                  │
       ▼                  ▼
  Some may be null  Some may be null
  (failed artifacts) (failed artifacts)
```

**Wave 3 failure handling:**
- If any non-fatal agent fails, log `agent:failed` event, persist `status: FAILED` on that artifact, continue
- Downstream agents (Terraform, Reviewer) receive `None` for failed optional inputs
- User sees real-time: "❌ Security agent failed — continuing..."

### Wave 4: Terraform Agent (Sequential)

```
FastAPI Orchestrator
│
│  terraform_agent(
│    plan=ProjectPlan,
│    architecture=ArchitectureModel,
│    aws_architecture=AwsArchitecture,
│    security=SecurityReport | None     # None if Security agent failed
│  )
│
▼
Anthropic API (largest call — ~4000 output tokens)
│
▼
FastAPI Orchestrator
│  Non-fatal: if fails after 2 retries, continue to Reviewer
│  Reviewer will note Terraform unavailability
```

### Wave 5: Reviewer Agent (Sequential, Mandatory)

```
FastAPI Orchestrator
│
│  reviewer_agent(
│    plan=ProjectPlan,
│    architecture=ArchitectureModel,
│    aws_architecture=AwsArchitecture,
│    security=SecurityReport | None,
│    cost=CostModel | None,
│    terraform=TerraformBundle | None,
│    diagram=DiagramModel | None
│  )
│
▼
Anthropic API (~8000 input tokens, ~2500 output tokens)
│
▼
FastAPI Orchestrator
│
│  Mandatory-Retry: up to 3 attempts
│  If all 3 fail:
│    → Mark job PARTIAL
│    → Return all available artifacts
│    → Emit job:complete with reviewer_unavailable: true
│
│  If succeeds:
│    → Persist ReviewReport artifact
│    → Emit agent:complete for reviewer
```

---

## Phase 4: Job Completion

```
FastAPI Orchestrator
│
│  Collect all artifact results:
│  {
│    plan: { status: "complete", artifact: ProjectPlan },
│    architecture: { status: "complete", artifact: ArchitectureModel },
│    aws_architecture: { status: "complete", artifact: AwsArchitecture },
│    security: { status: "failed" },
│    cost: { status: "complete", artifact: CostModel },
│    terraform: { status: "complete", artifact: TerraformBundle },
│    diagram: { status: "complete", artifact: DiagramModel },
│    reviewer: { status: "complete", artifact: ReviewReport }
│  }
│
│  Compute: job_status = all_fatal_complete ? "COMPLETE" : "FAILED"
│           if fatal agents complete but some non-fatal failed: "PARTIAL"
│
│  Return to NestJS Worker:
│  { jobStatus: "PARTIAL", artifacts: [...], totalDurationMs: 52340 }
│
▼
NestJS Worker
│
│  1. Update Job record: status → PARTIAL | COMPLETE | FAILED, completedAt = now()
│  2. Write final JobEvent: { event: "job:complete", payload: { status, artifactCount } }
│  3. Emit WebSocket to user's room:
│     {
│       event: "job:complete",
│       jobId: "job_xyz",
│       status: "PARTIAL",
│       artifacts: [{ type, id, available: true/false }],
│       totalDurationMs: 52340,
│       traceId: "trace_123"
│     }
│
▼
User Browser
│
│  WebSocket event received
│  UI transitions from "progress" to "results" view
│  Shows all available artifacts
│  Shows "Security review unavailable" notice for failed artifact
│  Shows Reviewer findings prominently
```

---

## Phase 5: Artifact Retrieval (On Demand)

```
User Browser
│
│  GET /api/v1/projects/proj_abc
│  Authorization: Bearer <access_token>
│
▼
NestJS ProjectsController
│
│  SELECT * FROM projects WHERE id = 'proj_abc' AND userId = <current_user_id>
│  ← Ownership enforced at query level
│
│  If not found: 404 Not Found
│  If found: return project + all artifacts
│
▼
NestJS Response
│  {
│    project: { id, prompt, status, createdAt },
│    artifacts: [
│      { type: "PLAN", id: "art_001", payload: { ...ProjectPlan }, schemaVersion: "1.0" },
│      { type: "ARCHITECTURE", id: "art_002", payload: { ...ArchitectureModel }, schemaVersion: "1.0" },
│      ...
│    ]
│  }
│
▼
User Browser
│  Zod validates each artifact payload against its schema
│  Renders artifacts by type
```

---

## Error Paths

### Fatal Agent Failure (Planner or Architecture or AWS Expert)

```
FastAPI Orchestrator
│
│  FatalAgentError raised (e.g., Planner fails after 3 retries)
│
▼
FastAPI returns error response to NestJS Worker:
│  { status: 500, error: "FATAL_AGENT_FAILURE", agent: "planner", traceId: "trace_123" }
│
▼
NestJS Worker
│  1. Catches error
│  2. Updates Job: status → FAILED, errorMessage = "Planner agent failed after 3 retries"
│  3. Writes JobEvent: { event: "job:failed", payload: { agent: "planner", retries: 3 } }
│  4. Emits WebSocket: { event: "job:failed", jobId, error: "Pipeline failed at planner stage", traceId }
│  5. BullMQ marks job as FAILED (no further retries for fatal errors)
│
▼
User Browser
│  Sees: "Job failed — Planner could not process your request. Please try again."
│  CTA: "Try again" button (creates new job with same prompt)
```

### LLM Provider Outage

```
FastAPI Orchestrator
│
│  Anthropic API returns 503 repeatedly
│
▼
FastAPI raises ProviderUnavailableError after 3 retries
│
▼
NestJS Worker
│  BullMQ retry policy: retry with exponential backoff (2s → 4s → 8s → 16s...)
│  After max_retries (3): move job to Dead Letter Queue (DLQ)
│
▼
NestJS (DLQ processor)
│  Updates Job: status → STUCK
│  Emits WebSocket: { event: "job:stuck", message: "LLM provider unavailable — job queued for retry", traceId }
│
▼
User Browser
│  Sees: "⏳ LLM provider is experiencing issues. Your job will resume automatically when service is restored."
```

### WebSocket Disconnect (User Closes Tab)

```
User closes browser tab during job execution
│
│  (Job continues in background — it's async)
│
FastAPI + NestJS Worker continue executing
│
│  Job completes in background
│  WebSocket events are emitted to the user's room
│  (No one is listening, events are dropped)
│
When user returns and opens /projects/proj_abc:
│
│  GET /api/v1/projects/proj_abc
│  Project shows status: COMPLETE | PARTIAL | FAILED
│  All available artifacts are returned
│  User sees full results without needing the WebSocket
```

---

## Trace Propagation Summary

| Layer | How traceId flows |
|---|---|
| NestJS Middleware | Generates `traceId = uuidv4()` on every incoming request |
| NestJS → BullMQ | `traceId` included in BullMQ job payload |
| NestJS → FastAPI | `X-Trace-Id: trace_123` header on internal HTTP call |
| FastAPI | Extracts `traceId` from header, binds to structlog context for all log lines |
| FastAPI → Anthropic | `traceId` included in log lines around every LLM call |
| FastAPI → NestJS callbacks | `traceId` included in event callback payloads |
| NestJS → WebSocket | `traceId` included in every WebSocket event payload |
| NestJS → Client | `X-Trace-Id` response header on initial POST |

To reconstruct any job execution from logs:
```
CloudWatch Logs Insights:
fields @timestamp, level, message, agent, durationMs
| filter traceId = "trace_123"
| sort @timestamp asc
```

---

## WebSocket Event Reference

### Client → Server

```typescript
// Subscribe to job updates
socket.emit('job:subscribe', { jobId: string })

// Unsubscribe (optional — handled automatically on disconnect)
socket.emit('job:unsubscribe', { jobId: string })
```

### Server → Client

```typescript
// Agent started
{ event: 'agent:started', jobId: string, agent: string, traceId: string, timestamp: string }

// Agent completed successfully
{ event: 'agent:complete', jobId: string, agent: string, durationMs: number, tokenUsage: { input: number, output: number }, traceId: string, timestamp: string }

// Agent failed (non-fatal — job continues)
{ event: 'agent:failed', jobId: string, agent: string, error: string, fatal: false, traceId: string, timestamp: string }

// Job completed (all agents done)
{ event: 'job:complete', jobId: string, status: 'COMPLETE' | 'PARTIAL', artifacts: ArtifactSummary[], totalDurationMs: number, traceId: string, timestamp: string }

// Job failed (fatal agent failure)
{ event: 'job:failed', jobId: string, error: string, failedAgent: string, traceId: string, timestamp: string }

// Job stuck (LLM provider outage)
{ event: 'job:stuck', jobId: string, message: string, traceId: string, timestamp: string }
```
