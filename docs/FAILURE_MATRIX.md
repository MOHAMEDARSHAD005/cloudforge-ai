# FAILURE_MATRIX.md
> Failure classification, retry policies, fallback behavior, and partial completion handling for CloudForge AI.
> Every failure mode must have a classification, a retry policy, and a defined outcome.
> Last updated: June 2026

---

## Failure Classification

| Class | Meaning | Job Outcome |
|---|---|---|
| **Fatal** | The pipeline cannot produce a useful result without this agent. | Job status: `FAILED`. No artifacts returned. |
| **Non-Fatal** | The pipeline can produce useful results even without this agent. | Job status: `PARTIAL`. Available artifacts returned. |
| **Mandatory-Retry** | This agent must eventually succeed. Failure after retries degrades to PARTIAL (not FAILED). | Job status: `PARTIAL`. All other artifacts returned. |
| **Transient** | A failure caused by infrastructure (network timeout, LLM 5xx). Retry is correct. | Resolved by retry policy. No state change until max retries exhausted. |
| **Permanent** | A failure caused by invalid output (Pydantic ValidationError). Retrying with different temp may help; retrying identically will not. | After max retries, classify as Fatal or Non-Fatal based on agent. |

---

## Agent Failure Matrix

| Agent | Class | Max Retries | Backoff | Job Outcome on Final Failure | User-Facing Message |
|---|---|---|---|---|---|
| Planner | **Fatal** | 3 | 2s → 4s → 8s | `FAILED` | "Pipeline failed — unable to process your requirement. Please try again." |
| Architecture | **Fatal** | 3 | 2s → 4s → 8s | `FAILED` | "Pipeline failed — architecture design could not be completed." |
| AWS Expert | **Fatal** | 3 | 2s → 4s → 8s | `FAILED` | "Pipeline failed — AWS architecture could not be determined." |
| Security | **Non-Fatal** | 2 | 2s → 4s | `PARTIAL` | "⚠️ Security review unavailable. Manually review IAM and encryption configuration." |
| Cost | **Non-Fatal** | 2 | 2s → 4s | `PARTIAL` | "⚠️ Cost estimate unavailable. Refer to AWS Pricing Calculator for estimates." |
| Diagram | **Non-Fatal** | 2 | 2s → 4s | `PARTIAL` | "⚠️ Diagrams unavailable. Architecture is described in the Architecture report." |
| Terraform | **Non-Fatal** | 2 | 2s → 4s | `PARTIAL` | "⚠️ Terraform unavailable. Refer to the architecture report for manual IaC creation." |
| Reviewer | **Mandatory-Retry** | 3 | 2s → 4s → 8s | `PARTIAL` (never FAILED) | "⚠️ Engineering review unavailable. Please review the architecture artifacts manually." |

---

## Retry Policy Details

### Transient Errors (Retry Immediately)
- LLM provider 429 (rate limit): retry with exponential backoff
- LLM provider 500/503 (server error): retry with exponential backoff
- Network timeout: retry with exponential backoff
- FastAPI 5xx response: retry from NestJS worker

### Permanent Errors (Retry With Adjusted Temperature)
- Pydantic `ValidationError` (LLM returned malformed JSON or unexpected structure)
  - Attempt 1: same prompt
  - Attempt 2+: prompt with explicit instruction to match schema exactly, temperature slightly increased
  - Rationale: deterministic temperature often produces the same invalid output on retry

### Non-Retryable Errors (Immediate Failure)
- Prompt injection detected (`injection_detected: true` in Planner output): fail job immediately, log security event
- Context length exceeded by more than 2× (pre-flight check): fail agent, do not call LLM
- Authentication failure to LLM provider: fail job immediately, alert on-call

---

## BullMQ Retry Configuration

```typescript
// In NestJS QueueService — job-level retry config
const jobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,       // 2s → 4s → 8s
  },
  removeOnComplete: { count: 100 },   // Keep last 100 completed jobs for debugging
  removeOnFail: { age: 7 * 24 * 3600 },  // Keep failed jobs for 7 days
};
```

**Important distinction:**
- BullMQ `attempts` is for the **entire job** (NestJS Worker → FastAPI → all agents)
- Agent-level retries are handled **inside FastAPI** with Python `tenacity` or custom retry logic
- BullMQ retries are the outer safety net for infrastructure failures (FastAPI unreachable, Worker crash)

---

## Partial Completion Behavior

When a job completes in `PARTIAL` state:

1. **Artifacts persisted:** All successfully generated artifacts are persisted with `status: COMPLETE`
2. **Failed artifacts persisted:** Failed agent artifacts are persisted with `status: FAILED` and `error_message`
3. **Job record:** `status: PARTIAL`, `completedAt` is set
4. **WebSocket event:** `job:complete` with `status: PARTIAL` and per-artifact availability flags
5. **Frontend display:**
   - Show all available artifacts normally
   - Show a `[UNAVAILABLE]` banner for failed artifact types
   - Include the user-facing message from the table above
   - Offer a "Retry failed agents" button (re-runs only the failed agents, not the whole pipeline — using idempotency per ADR-015)

---

## Failure Scenarios by Category

### Infrastructure Failures

| Failure | Detection | Response |
|---|---|---|
| Redis unavailable | BullMQ connection error | NestJS: return 503 on job creation. Alert on-call immediately. |
| PostgreSQL unavailable | Prisma connection error | NestJS: return 503 on all endpoints. Alert on-call immediately. |
| FastAPI unreachable (VPC issue) | NestJS Worker HTTP timeout | BullMQ retries (up to 3). If persistent: move job to DLQ. Alert on-call. |
| LLM provider outage (Anthropic 503) | FastAPI: repeated 503 from API | FastAPI retries per agent. BullMQ retries job. After max retries: job status → STUCK. User notified via WebSocket. |
| ECS task crash (NestJS) | ALB health check failure | ECS replaces task. In-flight requests receive 502. Client retries. BullMQ jobs survive (Redis-backed). |
| ECS task crash (FastAPI) | Internal health check failure | ECS replaces task. NestJS Worker HTTP call fails → BullMQ retry picks up job when FastAPI recovers. |

### Agent-Level Failures

| Failure | Agent | Response |
|---|---|---|
| Pydantic ValidationError | Any | Retry with adjusted temperature (up to max retries). After retries: classify per matrix. |
| Output truncated (max_tokens hit) | Terraform (most common) | Retry with smaller scope instruction. If still truncated: persist partial output with `truncated: true` flag. |
| Injection detected | Planner | Fail job immediately. Log security event. Do not retry. |
| Context too long | Reviewer | Pre-flight check: estimate token count. If > 8,000 input tokens: summarize non-fatal agent outputs before passing to Reviewer. |
| Rate limit from LLM provider | Any | Backoff and retry. If persists > 60s: emit `job:delayed` event to user. |

### Data Failures

| Failure | Response |
|---|---|
| Artifact write fails (DB error) | Retry DB write up to 3 times. If fails: job status → FAILED, JobEvent records the DB error. |
| Duplicate artifact (idempotency violation) | On conflict: return existing artifact. Log warning. No duplicate LLM call. |
| JobEvent write fails | Log error, continue. JobEvent loss is acceptable (observability loss, not data loss). |
| TokenUsage write fails | Log error, continue. TokenUsage loss is acceptable (cost reporting is best-effort). |

---

## Dead Letter Queue (DLQ)

Jobs land in the DLQ after exhausting all BullMQ retries:

```typescript
// BullMQ DLQ processor
@Process('dlq')
async processDLQ(job: Job) {
  const { jobId, traceId } = job.data;
  
  await this.jobsService.updateStatus(jobId, JobStatus.STUCK);
  await this.jobEventsService.write(jobId, 'job:stuck', { reason: 'max_retries_exceeded' });
  
  // Notify user if still connected
  this.wsGateway.emitToJob(jobId, 'job:stuck', {
    message: 'Your job has been queued for retry when the service recovers.',
    traceId,
  });
  
  // Alert on-call if multiple jobs hitting DLQ
  if (await this.dqlCountExceeds(10, '5m')) {
    await this.alerting.trigger('DLQ_SPIKE', { count: 10, traceId });
  }
}
```

DLQ jobs are retained for 7 days. Manual re-queue available via admin endpoint.

---

## Observability for Failures

Every agent failure emits these signals:

**Structured log:**
```json
{
  "timestamp": "2026-06-24T10:00:00Z",
  "level": "error",
  "service": "ai-fastapi",
  "traceId": "trace_123",
  "jobId": "job_xyz",
  "agent": "security",
  "event": "agent_failed",
  "failure_class": "non_fatal",
  "failure_reason": "ValidationError",
  "retry_attempt": 2,
  "max_retries": 2,
  "message": "Security agent failed after 2 retries — continuing as non-fatal"
}
```

**Metric increments:**
- `agent_failure_total{agent="security", failure_reason="ValidationError"}` +1
- `agent_retry_total{agent="security"}` +2

**JobEvent record:**
```json
{ "jobId": "job_xyz", "event": "agent:failed", "payload": { "agent": "security", "retries": 2, "fatal": false } }
```

**Alert trigger (if threshold exceeded):**
- `security` agent failure rate > 10% in 5 minutes → PagerDuty alert

---

## Failure Rate Targets (SLOs)

| Metric | Target | Alert Threshold |
|---|---|---|
| Fatal job failure rate | < 1% | > 3% in 5 minutes |
| Partial job completion rate | > 95% (at least fatal agents succeed) | < 90% in 5 minutes |
| Non-fatal agent failure rate (any single agent) | < 5% | > 10% in 5 minutes |
| Reviewer agent failure rate | < 2% | > 5% in 5 minutes |
| Pydantic validation failure rate | < 1% | > 3% in 5 minutes |
| BullMQ DLQ rate | < 0.5% | > 2% in 5 minutes |
