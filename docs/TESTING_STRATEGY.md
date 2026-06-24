# TESTING_STRATEGY.md
> Testing strategy for CloudForge AI: unit, integration, E2E, golden dataset, prompt regression, chaos, and load tests.
> Last updated: June 2026

---

## Principles

1. **Test behavior, not implementation.** Tests validate that agents return valid outputs — not that they call specific internal functions.
2. **Golden dataset is the regression anchor.** Any change to a prompt, model, or agent logic must pass the golden dataset before merging.
3. **Don't mock the LLM in prompt tests.** Real LLM calls in golden dataset tests catch model drift. Mock only in unit tests.
4. **Failure tests are first-class.** Retry logic, partial completion, and idempotency must be tested explicitly — not assumed to work.
5. **CI blocks on all tiers except load tests.** Load and chaos tests run on a schedule, not on every PR.

---

## Test Tiers

| Tier | Scope | Speed | LLM Calls | Runs In |
|---|---|---|---|---|
| Unit | Single function/class | < 1s per test | Never | Every PR |
| Integration | Service + DB, no LLM | < 30s per suite | Never | Every PR |
| E2E (mocked LLM) | Full request cycle, LLM mocked | < 60s per suite | Never | Every PR |
| Golden Dataset | Real LLM calls on canonical prompts | 5–10 min | Yes | Every PR that touches prompts or models |
| Prompt Regression | Compare new prompt version vs previous | 10–20 min | Yes | Prompt version changes only |
| Artifact Schema | Validate all artifacts against Zod schemas | < 30s | Never | Every PR |
| Retry/Idempotency | Simulate agent failures, verify recovery | < 2 min | Never (mocked) | Every PR |
| Chaos | Inject infrastructure failures | 5–15 min | Never | Weekly scheduled run |
| Load | Simulate concurrent users | 20–60 min | Yes (staging) | Weekly scheduled run |

---

## Unit Tests

### NestJS (Jest)

**What to test:**
- `ProjectsService.createProject()` — validates input, creates correct DB records
- `QueueService.enqueue()` — correct job payload, correct queue name
- `ArtifactsService.persistArtifact()` — correct JSONB write, correct provenance fields
- `JobsService.updateStatus()` — correct state transitions (PENDING → RUNNING → COMPLETE)
- Auth middleware — valid JWT passes, expired JWT rejects, malformed JWT rejects
- Rate limiter — blocks after 2 concurrent jobs, blocks after 20 daily jobs
- Prompt injection guard — rejects known injection patterns, passes clean prompts

**Coverage target:** 80% line coverage on NestJS services. 100% on auth and rate limiting.

**Example:**
```typescript
// apps/api-nest/src/jobs/jobs.service.spec.ts
describe('JobsService.updateStatus', () => {
  it('should transition PENDING → RUNNING', async () => {
    const job = await factory.createJob({ status: JobStatus.PENDING });
    await service.updateStatus(job.id, JobStatus.RUNNING, { startedAt: new Date() });
    const updated = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updated.status).toBe(JobStatus.RUNNING);
    expect(updated.startedAt).toBeDefined();
  });

  it('should NOT transition COMPLETE → RUNNING', async () => {
    const job = await factory.createJob({ status: JobStatus.COMPLETE });
    await expect(
      service.updateStatus(job.id, JobStatus.RUNNING, {})
    ).rejects.toThrow(InvalidStatusTransitionError);
  });
});
```

### FastAPI (pytest)

**What to test:**
- `PlannerAgent.run()` — with mocked LLM response, returns valid `ProjectPlan`
- `PlannerAgent.run()` — with malformed LLM response (missing fields), raises `ValidationError` and retries
- `TerraformAgent.run()` — with mocked response, returns `TerraformBundle` with all 5 files
- `Orchestrator.run_waves()` — Wave 3 agents continue when one non-fatal agent raises exception
- `Orchestrator.run_waves()` — job fails when fatal agent (Planner) raises after max retries
- `idempotency.get_or_generate()` — returns cached artifact when artifact exists with COMPLETE status
- `token_accounting.record_usage()` — correctly calculates `cost_usd` from token counts and pricing table

**Coverage target:** 80% line coverage on agent logic. 100% on orchestrator wave execution and failure handling.

**Example:**
```python
# apps/ai-fastapi/tests/agents/test_planner.py
@pytest.mark.asyncio
async def test_planner_retries_on_validation_error(mock_llm_client):
    # First call returns malformed output, second returns valid
    mock_llm_client.messages.create.side_effect = [
        mock_response(content='{"invalid": "structure"}'),
        mock_response(content=valid_project_plan_json()),
    ]

    result = await planner_agent.run(PlannerInput(
        requirement="Build a Netflix backend",
        trace_id="trace_test_001"
    ))

    assert isinstance(result, ProjectPlan)
    assert mock_llm_client.messages.create.call_count == 2  # Retried once
```

---

## Integration Tests

### NestJS Integration (Jest + Testcontainers)

Use **Testcontainers** to spin up real PostgreSQL and Redis for integration tests. No mocking of DB or queue.

**What to test:**
- `POST /api/v1/projects` → creates Project + Job records in DB, enqueues BullMQ job
- `GET /api/v1/projects/:id` → returns project with correct ownership check (different userId returns 404)
- `GET /api/v1/artifacts/share/:token` → returns artifact without auth header
- `POST /api/v1/auth/refresh` → rotates refresh token, returns new access token
- BullMQ job enqueue → Worker picks up job → calls FastAPI (mocked) → artifact persisted in DB

```typescript
// apps/api-nest/test/projects.integration.spec.ts
describe('POST /api/v1/projects', () => {
  it('should create project and enqueue job', async () => {
    const { accessToken, userId } = await authHelper.login(testUser);

    const response = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ prompt: 'Build a school ERP for 50,000 users' })
      .expect(201);

    expect(response.body).toMatchObject({
      projectId: expect.any(String),
      jobId: expect.any(String),
      traceId: expect.any(String),
    });

    const project = await prisma.project.findUnique({
      where: { id: response.body.projectId }
    });
    expect(project.userId).toBe(userId);
    expect(project.status).toBe('PENDING');

    const bullJob = await queue.getJob(response.body.jobId);
    expect(bullJob).toBeDefined();
    expect(bullJob.data.prompt).toBe('Build a school ERP for 50,000 users');
  });
});
```

### FastAPI Integration (pytest + Testcontainers)

**What to test:**
- `POST /generate` — end-to-end with mocked Anthropic client — all artifacts persisted correctly
- `POST /generate` with existing complete artifacts — returns cached artifacts, no LLM calls made
- Orchestrator partial completion — Security agent raises exception — job completes PARTIAL status
- Token usage records written correctly per agent

---

## End-to-End Tests (Mocked LLM)

E2E tests run the full request cycle: HTTP request → NestJS → BullMQ → FastAPI → PostgreSQL → WebSocket event → response.

The LLM client is mocked at the FastAPI boundary to return fixture responses. No real LLM calls.

**Fixture responses:** Stored in `apps/ai-fastapi/tests/fixtures/` — one JSON file per agent with a realistic valid response.

**What to test:**
- Full job lifecycle: submit prompt → all agents run → all artifacts persisted → `job:complete` WebSocket event
- Partial job lifecycle: Security agent fixture raises exception → job completes PARTIAL → 7 of 8 artifacts available
- Fatal failure: Planner fixture raises exception after 3 retries → `job:failed` WebSocket event
- Idempotency: re-submit same jobId → existing artifacts returned, no fixture functions called
- WebSocket event sequence: verify events arrive in correct order (agent:started, agent:complete, job:complete)

**Tools:**
- `socket.io-client` in Jest for WebSocket assertions
- `supertest` for HTTP assertions
- `bullmq` test utilities for queue inspection

---

## Golden Dataset Tests

### Purpose

Catch regressions in real LLM output quality and schema compliance. These use **real Anthropic API calls** against a set of canonical prompts.

### Canonical Prompts (5 required)

| ID | Prompt | Scale Tier | Key Assertions |
|---|---|---|---|
| GD-001 | "Build a Netflix backend for 10 million users" | Large | Has CDN, multi-region, Redis, PostgreSQL replica |
| GD-002 | "Build a school ERP for 50,000 students" | Medium | Has role-based auth, multi-tenant, no CDN required |
| GD-003 | "Build a real-time chat app for 1 million users" | Large | Has WebSocket, message queue, horizontal scaling |
| GD-004 | "Build an e-commerce platform for 100 products" | Small | Has payment gateway, inventory, simple DB |
| GD-005 | "Build a CI/CD platform for a 10-engineer team" | Small | Has artifact storage, pipeline queue, GitHub integration |

### Assertions Per Prompt

Every golden dataset run asserts:

1. **Schema validity:** All 8 Pydantic output models validate without error
2. **Provenance fields:** `schema_version`, `prompt_version`, `model_name` present in every artifact
3. **Structural completeness:** Required fields are non-empty (e.g., `ProjectPlan.components` has ≥ 3 items)
4. **Reviewer coherence:** `ReviewReport.overall_assessment` is one of the valid enum values
5. **Terraform syntax:** `TerraformBundle` files parse with `hcl2` Python library (syntax check, not semantic)
6. **Mermaid syntax:** `DiagramModel.mermaid_flowchart` parses with `mermaid-py` library
7. **Cost structure:** `CostModel` has exactly 3 tiers (small, medium, large) with numeric totals

### Running Golden Dataset Tests

```bash
# Run all 5 canonical prompts
ANTHROPIC_API_KEY=$KEY pytest apps/ai-fastapi/tests/golden/ -v --timeout=300

# Run single canonical prompt
ANTHROPIC_API_KEY=$KEY pytest apps/ai-fastapi/tests/golden/test_gd001.py -v

# Output: per-agent token counts, duration, pass/fail per assertion
```

**When to run:** Every PR that touches `packages/shared-prompts/`, `apps/ai-fastapi/models/`, or `apps/ai-fastapi/agents/`.

**Cost per run:** ~5 prompts × ~30,000 tokens avg = ~150,000 tokens ≈ $0.50 USD per run. Acceptable.

---

## Prompt Regression Tests

### Purpose

When a new prompt version (e.g., `planner/v2`) is introduced, compare its output quality and schema compliance against the previous version (`planner/v1`) on all 5 golden dataset prompts.

### Process

```bash
# Run golden dataset with v1 (baseline)
PROMPT_VERSION=v1 pytest apps/ai-fastapi/tests/golden/ --output=results_v1.json

# Run golden dataset with v2 (new)
PROMPT_VERSION=v2 pytest apps/ai-fastapi/tests/golden/ --output=results_v2.json

# Compare: schema pass rate, output quality scores, token counts
python scripts/compare_prompt_versions.py results_v1.json results_v2.json
```

**Gate:** A new prompt version may only be set as default in `agent-defaults.ts` if:
- Schema validity: 5/5 prompts pass (same as v1)
- No increase in token count > 20% (cost regression check)
- Structural completeness scores are equal or better

### Prompt Regression Test Output

```
Prompt Regression Report: planner v1 → v2
========================================
GD-001: ✅ Schema valid | Tokens: 1243 → 1180 (-5%) | Completeness: 8/8 fields
GD-002: ✅ Schema valid | Tokens: 1089 → 1102 (+1%) | Completeness: 8/8 fields
GD-003: ✅ Schema valid | Tokens: 1312 → 1298 (-1%) | Completeness: 8/8 fields
GD-004: ✅ Schema valid | Tokens: 987  → 1044 (+6%)  | Completeness: 8/8 fields
GD-005: ✅ Schema valid | Tokens: 1156 → 1121 (-3%) | Completeness: 8/8 fields

Result: ✅ PASS — v2 may replace v1 as default
```

---

## Artifact Schema Tests

### Purpose

Validate that every artifact type's Zod schema (TypeScript) correctly accepts valid payloads and rejects invalid ones.

### What to Test

For each of the 8 artifact types:
- Valid fixture payload → Zod `parse()` succeeds
- Missing required field → Zod `parse()` throws
- Wrong type on field → Zod `parse()` throws
- Provenance fields missing → Zod `parse()` throws (schema_version, prompt_version required)

```typescript
// packages/shared-types/src/__tests__/project-plan.schema.spec.ts
describe('ProjectPlan schema', () => {
  it('should accept a valid ProjectPlan', () => {
    expect(() => ProjectPlanSchema.parse(validProjectPlanFixture())).not.toThrow();
  });

  it('should reject a payload missing schema_version', () => {
    const invalid = { ...validProjectPlanFixture(), schema_version: undefined };
    expect(() => ProjectPlanSchema.parse(invalid)).toThrow(ZodError);
  });

  it('should reject scale_tier outside enum values', () => {
    const invalid = { ...validProjectPlanFixture(), scale_tier: 'gigantic' };
    expect(() => ProjectPlanSchema.parse(invalid)).toThrow(ZodError);
  });
});
```

**Coverage target:** Every field in every schema is covered by at least one positive and one negative test.

---

## Retry and Idempotency Tests

### Retry Tests

```python
# apps/ai-fastapi/tests/test_retry.py
@pytest.mark.asyncio
async def test_planner_retries_on_transient_500(mock_llm_client):
    """LLM returns 500 twice, then succeeds. Should retry and succeed."""
    mock_llm_client.messages.create.side_effect = [
        APIStatusError(status_code=500, ...),
        APIStatusError(status_code=500, ...),
        mock_response(content=valid_project_plan_json()),
    ]
    result = await planner_agent.run(input)
    assert isinstance(result, ProjectPlan)
    assert mock_llm_client.messages.create.call_count == 3

@pytest.mark.asyncio
async def test_planner_fails_after_max_retries(mock_llm_client):
    """LLM returns 500 three times. Should raise FatalAgentError."""
    mock_llm_client.messages.create.side_effect = APIStatusError(status_code=500, ...)
    with pytest.raises(FatalAgentError):
        await planner_agent.run(input)
    assert mock_llm_client.messages.create.call_count == 3

@pytest.mark.asyncio
async def test_non_fatal_agent_failure_does_not_kill_job(mock_llm_client):
    """Security agent raises after max retries. Job continues and completes PARTIAL."""
    # Security agent mock raises, all others succeed
    ...
    result = await orchestrator.run(job_input)
    assert result.status == "PARTIAL"
    assert result.artifacts.security is None
    assert result.artifacts.architecture is not None
```

### Idempotency Tests

```python
@pytest.mark.asyncio
async def test_cached_artifact_is_returned_without_llm_call(db, mock_llm_client):
    """If a COMPLETE artifact exists for the jobId, no LLM call is made."""
    # Pre-populate DB with complete artifact
    await db.artifacts.create(job_id="job_xyz", type="PLAN", status="COMPLETE", payload=...)

    result = await orchestrator.get_or_generate_artifact(
        job_id="job_xyz",
        artifact_type="PLAN",
        generator_fn=planner_agent.run
    )

    assert mock_llm_client.messages.create.call_count == 0  # No LLM call
    assert result == pre_populated_payload
```

---

## Chaos Tests

**Schedule:** Weekly, run against staging environment (not production).

**Tools:** Simulate infrastructure failures by temporarily modifying configurations or injecting errors via test endpoints.

### Chaos Scenarios

| Scenario | Method | Expected Outcome |
|---|---|---|
| Redis connection dropped mid-job | Kill ElastiCache connection from staging task | In-flight jobs complete via FastAPI; new jobs queue when Redis recovers |
| FastAPI task killed mid-pipeline | `aws ecs stop-task` during active job | BullMQ retries; job resumes when new FastAPI task starts |
| LLM provider 503 injected | Mock LLM client returns 503 for 60s | Agent retries, BullMQ DLQ, user sees `job:stuck` — recovers on retry |
| PostgreSQL connection limit hit | Set `max_connections=5` temporarily | NestJS returns 503 on DB writes; recovers when connections freed |
| Security agent always fails | Force SecurityAgent to raise for 5 min | All jobs complete PARTIAL; Reviewer notes security review unavailable |
| Token budget exceeded | Inject response with 100,000 tokens | Alert fires; job continues; token_usage record shows spike |

### Chaos Test Pass Criteria

- No jobs lost (all can be recovered via re-queue)
- Users receive appropriate WebSocket events (no silent failures)
- Alerts fire within 60 seconds of fault injection
- System recovers without manual intervention within 5 minutes of fault removal

---

## Load Tests

**Schedule:** Weekly, run against staging environment.  
**Tool:** [k6](https://k6.io) or [Locust](https://locust.io)

### Load Test Scenarios

**Scenario 1: Baseline Load (10 concurrent users)**
- 10 users each submitting 1 job simultaneously
- Duration: 10 minutes
- Assertion: P95 job duration < 90 seconds, 0 fatal failures

**Scenario 2: Burst Load (50 concurrent users)**
- 50 users submitting 1 job simultaneously
- Duration: 5 minutes
- Assertion: Queue depth < 100, P95 wait time < 30 seconds, < 2% fatal failures

**Scenario 3: Sustained Load (20 concurrent users, 30 min)**
- 20 users continuously submitting jobs
- Duration: 30 minutes
- Assertion: No memory leaks (ECS task memory stable), no connection pool exhaustion, < 1% fatal failures

**Scenario 4: Rate Limit Validation**
- Single user submits 25 jobs in 10 minutes (exceeds 20/day limit)
- Assertion: Jobs 21–25 receive 429 response

```javascript
// load-tests/baseline.js (k6)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '10m',
};

export default function () {
  const response = http.post(
    'https://staging.cloudforge.ai/api/v1/projects',
    JSON.stringify({ prompt: 'Build a school ERP for 50,000 students' }),
    { headers: { 'Authorization': `Bearer ${__ENV.TOKEN}`, 'Content-Type': 'application/json' } }
  );

  check(response, {
    'status is 201': (r) => r.status === 201,
    'has jobId': (r) => r.json('jobId') !== undefined,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(60); // 1 job per minute per VU
}
```

---

## CI Strategy
## GitHub Workflow Testing

Every workflow must be validated before merge.

Required checks:

* Workflow YAML validation
* actionlint
* Dependency installation verification
* Security workflow execution verification
* GitHub Action version verification

Workflow failures are treated as CI failures.

A workflow is not considered complete until validation succeeds on GitHub Actions.


## GitHub Workflow Validation

Every workflow must pass:

- actionlint
- YAML validation
- dependency resolution checks

CI failures caused by invalid GitHub Action references are treated as build failures.

### On Every PR

```yaml
# .github/workflows/ci.yml
jobs:
  lint-typecheck:
    - turbo lint
    - turbo type-check

  unit-tests:
    - turbo test:unit
    - Fail if coverage < 80% on services

  integration-tests:
    - docker compose up postgres redis
    - turbo test:integration
    - docker compose down

  e2e-tests:
    - docker compose up (full stack)
    - pytest apps/ai-fastapi/tests/e2e/ (LLM mocked)
    - jest apps/api-nest/test/e2e/ (LLM mocked)
    - docker compose down

  artifact-schema-tests:
    - jest packages/shared-types/src/__tests__/

  retry-idempotency-tests:
    - pytest apps/ai-fastapi/tests/test_retry.py
    - pytest apps/ai-fastapi/tests/test_idempotency.py

  terraform-validation:
    - Run golden dataset TerraformBundle fixtures through terraform validate + tflint
    - Fail if any validation error

  security-scans:
    - npm audit --audit-level=high (Monorepo)
    - pip-audit -r apps/ai-fastapi/requirements.txt (Python API)
    - trivy fs --severity HIGH,CRITICAL (Fail if any high/critical vulnerability)
    - CodeQL initialization and analyze (JavaScript/TypeScript + Python)
```

### On Prompt/Model Changes Only

```yaml
  golden-dataset-tests:
    - condition: files changed in packages/shared-prompts/ or apps/ai-fastapi/models/ or apps/ai-fastapi/agents/
    - pytest apps/ai-fastapi/tests/golden/ --timeout=300
    - Fail if any schema assertion fails
```

### Weekly Scheduled

```yaml
  security-scans:
    - schedule: '0 0 * * 0'  # Sunday midnight
    - Run CodeQL, Trivy FS, npm audit, and pip-audit scans on main

  chaos-tests:
    - schedule: '0 2 * * 1'  # Monday 2am
    - Run against staging
    - Slack notification on completion

  load-tests:
    - schedule: '0 3 * * 1'  # Monday 3am
    - Run against staging
    - Slack notification on completion
```

### Coverage Gates

| Service | Unit Test Minimum | Integration Test Minimum |
|---|---|---|
| NestJS services | 80% | N/A |
| NestJS auth + rate limiting | 100% | 100% |
| FastAPI agent logic | 80% | N/A |
| FastAPI orchestrator | 90% | 90% |
| Shared-types schemas | 100% (all fields) | N/A |
