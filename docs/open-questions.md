# open-questions.md
> Unresolved decisions, active investigations, and things that need an owner.
> When a question is resolved, move it to `decisions.md` as an ADR and mark it here as ✅ Resolved.
> Format: Priority (🔴 High / 🟡 Medium / 🟢 Low) → Question → Context → Options → Owner

---

## Status Legend

| Symbol | Meaning |
|---|---|
| `[ ]` | Open — not yet investigated |
| `[~]` | In progress — being actively explored |
| `[✅]` | Resolved — see linked ADR in decisions.md |
| `[⏸]` | Deferred — not needed until a specific phase |

---

## 🔴 High Priority

---

### OQ-001: Which LLM provider and model for each agent?

**Status:** `[~]` In Progress  
**Phase:** Must resolve before Phase 1 exit criteria

**Context:**  
The system makes 6–8 LLM calls per job. Different agents have different needs:
- Planner + Architecture + Reviewer: strong reasoning
- Terraform Agent: code generation ability
- Cost Agent: numerical accuracy
- Diagram Agent: structured JSON output only (simpler model acceptable)

Using the same model for every agent is wasteful and expensive.

**Options:**

| Option | Pros | Cons |
|---|---|---|
| Claude Sonnet 4.6 for all agents | Consistent, strong reasoning, good structured output | Higher cost per job |
| Claude Sonnet for reasoning, Claude Haiku for simple (Cost, Diagram) | Lower cost per job | Two SDK configurations |
| OpenAI GPT-4o (reasoning) + GPT-4o-mini (simple) | Strong code gen for Terraform | OpenAI vendor lock-in |
| Provider abstraction (swap per agent) | Maximum flexibility | More complex agent factory |

**Key questions:**
- Does Terraform Agent produce better output with a code-specialized model?
- What is the cost per job for each tier combination?
- What is the token budget per agent that keeps total job cost < $0.08?

**Recommended next step:** Build Planner + Architecture agents first. Benchmark Claude Sonnet cost/quality. Run Diagram Agent with Haiku for cost comparison. Decide model split in Phase 1 exit review.

**Owner:** Engineering Lead

---

### OQ-002: How do we handle database migrations with zero downtime?

**Status:** `[ ]` Open  
**Phase:** Must resolve before Phase 5 (AWS deployment)

**Context:**  
Prisma Migrate runs `ALTER TABLE` statements that can lock tables. For a multi-tenant app with `artifacts` and `projects` tables potentially holding millions of rows, a naive migration could cause downtime.

**Options:**

| Option | Pros | Cons |
|---|---|---|
| Expand-contract pattern (additive migrations → backfill → remove old) | True zero downtime | Slow, multi-deploy process |
| Blue-green deployment (migrate green, cut over) | Clean, rollback easy | Requires two full environments |
| Maintenance window | Simple | Downtime acceptable in early stages |
| pgroll or online schema migration | True zero-downtime | New tooling to learn |

**Key questions:**
- What is our actual availability requirement at launch? (SLO: 99.5% allows ~3.6 hrs/month downtime)
- Is a maintenance window acceptable for Phase 5 given user base size?

**Recommendation to validate:** Accept maintenance window for Phase 5 launch (user base is small). Implement expand-contract pattern when traffic crosses 1,000 active users/day.

**Owner:** Engineering Lead

---

### OQ-003: Auth strategy for NestJS → FastAPI service-to-service calls?

**Status:** `[✅]` Resolved  
**Resolution:** See ADR-021 (Shared Secret Authentication for Internal APIs). VPC security group rules are reinforced with a shared secret token `X-Internal-Token` passed in headers for both `/generate` calls and NestJS event callbacks.

**Phase:** Resolved in Phase 1

**Context:**  
NestJS BullMQ workers call FastAPI `/generate`. Currently there's no auth between them. In Docker Compose this is acceptable. In production on AWS (ECS tasks in a VPC) we need to ensure only NestJS can call FastAPI.

**Resolution Details:**
VPC security group rules (only NestJS SG → FastAPI SG on port 8000) are used in production, alongside a shared secret `X-Internal-Token` header as defence in depth. FastAPI calls back to NestJS using the same token.

**Owner:** Engineering Lead

---

### OQ-004: How to keep Pydantic models (Python) and Zod schemas (TypeScript) in sync?

**Status:** `[ ]` Open  
**Phase:** Must resolve before Phase 2 (all agents producing output)

**Context:**  
CloudForge AI has typed output models in two places:
- `apps/ai-fastapi/models/` → Pydantic (Python)
- `packages/shared-types/src/` → Zod (TypeScript)

If `CostModel` Pydantic schema changes and the Zod schema isn't updated, NestJS will silently fail to validate artifact payloads.

**Options:**

| Option | Pros | Cons |
|---|---|---|
| Manual sync + PR checklist + `SCHEMA_VERSION` constant | Simple, no tooling | Drift is likely over time |
| `pydantic-to-typescript` (generate Zod from Pydantic) | Single source of truth in Python | Build step, not all Pydantic types translate cleanly |
| JSON Schema as the source of truth (generate both) | True single source of truth | Complex toolchain |
| Runtime validation only | Zero tooling | No compile-time safety |

**Recommended approach:** Start with manual sync + shared `SCHEMA_VERSION` constant in `shared-config`. Add the `SCHEMA_VERSION` check to the PR checklist. Evaluate code generation in Phase 2 if drift becomes a problem (after 3+ schema changes).

**Owner:** Engineering Lead

---

### OQ-005: Observability stack — CloudWatch vs Datadog vs self-hosted Grafana?

**Status:** `[ ]` Open  
**Phase:** Must resolve before Phase 5 (AWS deployment)

**Context:**  
We need: application logs, infrastructure metrics, job queue depth metrics, LLM token usage per job, error alerting, distributed tracing across NestJS → BullMQ Worker → FastAPI.

**Options:**

| Option | Cost | Pros | Cons |
|---|---|---|---|
| CloudWatch (AWS native) | Pay per ingestion | No additional infra, native ECS integration | Expensive at scale, poor UX for distributed tracing |
| Datadog | ~$15/host/month | Best-in-class APM, distributed tracing | Cost grows fast with team |
| Grafana Cloud + Loki + Tempo | Low infra cost | Full control, great UX | Operational burden |
| OpenTelemetry → CloudWatch | Free traces | Vendor-neutral | Setup complexity |

**Recommendation:** CloudWatch for Phase 3–5 launch. Migrate to Grafana Cloud or Datadog when team grows past 3 engineers or when CloudWatch bill exceeds $150/month.

**Owner:** Engineering Lead

---

## 🟡 Medium Priority

---

### OQ-006: How should Terraform validation work in CI?

**Status:** `[~]` In Progress  
**Phase:** Phase 3

**Context:**  
The Terraform Agent generates `.tf` files. We need to verify they're valid before showing them to users. Options range from syntax-only checks to full plan execution.

**Recommended approach:** `terraform validate` + `tflint` + `checkov` as a post-generation step. Flag issues in the Reviewer Agent output rather than blocking artifact creation. This covers syntax, lint, and security scanning without requiring AWS credentials.

**Owner:** Engineering Lead

---

### OQ-007: How do we handle prompt length limits?

**Status:** `[~]` In Progress  
**Phase:** Phase 1

**Context:**  
As agents pass outputs to downstream agents, context grows. By the time Reviewer runs, it may receive 10,000+ tokens. This could exceed context windows or increase cost significantly.

**Recommended default:** Pass only the typed Pydantic model (structured JSON) between agents — not raw LLM text. The orchestrator serializes models to JSON before injecting into the next agent's system prompt. This keeps inter-agent context tight and predictable.

**Action needed:** Measure actual token counts in Phase 1 before committing to a summarization strategy.

**Owner:** Engineering Lead

---

### OQ-008: Multi-tenancy isolation model?

**Status:** `[⏸]` Deferred — Phase 4+

**Context:**  
All users currently share one PostgreSQL database with row-level ownership (`userId` on every resource). Enterprise customers may eventually want stronger isolation.

**Options:**
- Row-level security (RLS) in PostgreSQL — enforce at DB level
- Schema-per-tenant
- Database-per-tenant (high operational cost)
- Stay with app-level ownership (current approach)

**Deferred decision:** App-level ownership is sufficient for Phase 1–4. Revisit when a customer requires SOC 2 or data residency.

---

### OQ-009: How to version artifact outputs as agent prompts improve?

**Status:** `[✅]` Resolved  
**Resolution:** See ADR-012 (Artifact Provenance Metadata) and ADR-011 (Versioned Prompt Files). Every artifact stores `schema_version`, `prompt_version`, `model_name`. UI can offer re-generation when prompt version is behind current default.

---

### OQ-013: How do we enforce token budget limits per agent?

**Status:** `[ ]` Open  
**Phase:** Phase 3

**Context:**  
Per ADR-013, we track token usage per agent. But tracking after the fact doesn't prevent runaway LLM calls. We need a mechanism to cap token usage before it happens.

**Options:**

| Option | Pros | Cons |
|---|---|---|
| Set `max_tokens` in every LLM call | Prevents runaway output tokens | Truncated output may fail Pydantic validation |
| Pre-flight context length check | Validates input token count before calling LLM | Requires tokenizer library (tiktoken or equivalent for Claude) |
| Job-level token budget with early abort | Stops job if cumulative tokens exceed budget | Complex abort logic |
| Alert-only (no enforcement) | Simple | Cost spike before alert fires |

**Recommended approach:** Always set `max_tokens` in LLM API calls (per-agent budget in `agent-defaults.ts`). Add pre-flight context length estimate as a warning (not hard stop) in Phase 3. Hard budget enforcement in Phase 5 if token spike alerts prove insufficient.

**Owner:** Engineering Lead

---

### OQ-014: What is the Reviewer Agent retry policy?

**Status:** `[ ]` Open  
**Phase:** Must resolve before Phase 2

**Context:**  
Per `FAILURE_MATRIX.md`, if the Reviewer Agent fails, the job must retry. But the Reviewer receives ALL prior agent outputs as context. If it fails due to context length, retrying with the same context will fail again. If it fails due to a transient LLM error, retrying is correct.

**Options:**
- Retry Reviewer up to 3 times with exponential backoff (same context)
- Retry Reviewer with summarized context (reduce input token count)
- If Reviewer fails after 3 retries, fail the whole job
- If Reviewer fails after 3 retries, mark job as PARTIAL and show user all other artifacts

**Recommended approach:** Retry up to 3 times with exponential backoff. If all retries fail, mark job as PARTIAL (not FAILED) and display all non-Reviewer artifacts with a "Review unavailable" notice. This preserves user value even without the review.

**Owner:** Engineering Lead

---

### OQ-015: How do we handle LLM provider outages?

**Status:** `[ ]` Open  
**Phase:** Must resolve before Phase 5

**Context:**  
If Anthropic has an API outage, all in-flight jobs fail. BullMQ will retry, but if the outage lasts hours, jobs pile up in the queue indefinitely. Users have no visibility into why their job is stuck.

**Options:**
- Dead letter queue: after N retries, move job to DLQ and notify user
- Circuit breaker: detect provider outage, stop accepting new jobs, show status page notice
- Fallback provider: route to OpenAI if Anthropic returns repeated 503s
- Outage detection + user notification only (no automatic fallback)

**Recommended approach:** Dead letter queue (DLQ) in BullMQ after 3 retries + exponential backoff. Move failed jobs to DLQ and emit `job:stuck` WebSocket event with a user-facing message ("LLM provider is experiencing issues — your job will resume automatically"). Implement fallback provider only if Anthropic outages occur more than once/month in production.

**Owner:** Engineering Lead

---

## 🟢 Low Priority / Future

---

### OQ-010: When to add Azure and GCP support?

**Status:** `[⏸]` Deferred — Post v1.0

**Context:**  
Azure and GCP are future targets requiring provider-specific Terraform modules, cost models, and diagram templates.

**Trigger:** Add when user demand is measured (prompt frequency including "Azure" or "GCP" exceeds 15% of all submissions).

---

### OQ-011: Should Terraform output be validated by actually running `terraform plan`?

**Status:** `[⏸]` Deferred — Phase 5+

**Context:**  
`terraform validate` checks syntax but not semantics (e.g., an invalid AMI ID passes validate). Running `terraform plan` against real AWS would catch semantic errors but requires credentials and costs money.

**Trigger:** Revisit if users report generated Terraform frequently fails `terraform plan` in their own accounts.

---

### OQ-012: How should we handle user-uploaded existing architecture documents?

**Status:** `[⏸]` Deferred — Phase 4+

**Context:**  
A natural evolution is: "Here's my existing architecture — review it." This requires multimodal input (image or PDF) to the agent pipeline.

**Trigger:** Add when prompted by user feedback after v1.0 launch.

---

### OQ-016: Should we offer a streaming UI for agent outputs as they generate?

**Status:** `[⏸]` Deferred — Phase 4+

**Context:**  
Currently the UI shows agent outputs only after each agent is fully complete (Pydantic-validated). Streaming the LLM response token-by-token within an agent would feel more responsive but would conflict with our structured output requirement (you can't validate a partial JSON object).

**Options:**
- Stream raw tokens, then replace with validated output when complete
- Keep current behavior (show output after Pydantic validation)
- Show a "generating..." skeleton with agent name and elapsed time

**Recommended default:** Show agent name + animated progress indicator while generating (current WebSocket event carries `agent:started`). Full output appears after Pydantic validation. Streaming raw tokens is a Phase 4+ polish item.

---

### OQ-017: Which merge strategy should be used?

**Status:** `[✅]` Resolved  
**Resolution:** Squash Merge selected as standard. See ADR-017.

**Phase:** Must resolve before Phase 0 exit

**Context:**

All work flows through Pull Requests. GitHub provides:

- Merge Commit
- Squash Merge
- Rebase Merge

Consistency affects:

- Changelog generation
- Commit history readability
- Release automation

Options:

| Option | Pros | Cons |
|----------|------|------|
| Squash Merge | Clean history, one PR = one commit | Loses intermediate commits |
| Merge Commit | Preserves full history | Noisy history |
| Rebase Merge | Linear history | Rewrites commit hashes |

Recommended:

Squash Merge for Phase 1–5.

Owner: Engineering Lead

---

## Resolved Questions

| OQ | Question | Resolution | ADR |
|---|---|---|---|
| OQ-003 | Auth strategy for service-to-service calls? | Shared secret token header (X-Internal-Token) | ADR-021 |
| OQ-009 | How to version artifact outputs? | schema_version + prompt_version in every artifact | ADR-011, ADR-012 |
| OQ-017 | Which merge strategy should be used? | Squash Merge | ADR-017 |
| — | Should we use a monorepo? | Yes, Turborepo | ADR-001 |
| — | Which agent framework? | Pydantic AI | ADR-002 |
| — | Sync vs async jobs? | Async (BullMQ) | ADR-003 |
| — | Sequential vs parallel agents? | Hybrid parallel | ADR-004 |
| — | BullMQ vs SQS? | BullMQ now, SQS later | ADR-005 |
| — | How to store artifacts? | PostgreSQL JSONB | ADR-006 |
| — | Real-time updates mechanism? | Socket.IO WebSocket | ADR-007 |
| — | Should FastAPI be public? | No — VPC internal only | ADR-008 |
| — | Auth strategy? | JWT + HttpOnly cookies | ADR-009 |
| — | Do we need a Reviewer Agent? | Yes — mandatory last step | ADR-010 |
| — | How to version prompts? | Versioned immutable files | ADR-011 |
| — | What artifact provenance to store? | schema_version + prompt_version + model_name | ADR-012 |
| — | How to track token costs? | Per-agent token_usage records | ADR-013 |
| — | How to correlate logs across services? | Structured JSON + traceId propagation | ADR-014 |
| — | Is artifact generation retry-safe? | Yes — idempotent on jobId | ADR-015 |
