# RUNBOOKS.md
> Operational runbooks for CloudForge AI.
> Every alert in OBSERVABILITY.md links to a runbook here.
> Format: Symptoms → Diagnosis → Recovery Steps → Escalation Path
> Last updated: June 2026

---

## How to Use This Document

1. An alert fires → find the runbook by alert code (e.g., RB-001)
2. Follow Diagnosis steps to confirm the issue
3. Follow Recovery Steps in order — stop when the issue resolves
4. If recovery steps don't resolve within the stated time, escalate

**Golden rule:** Never take destructive action (delete data, force-kill tasks, drop tables) without first capturing diagnostics (logs, metrics, stack traces).

---

## Quick Reference

| Code | Alert | Severity |
|---|---|---|
| RB-001 | Fatal job failure rate high | Critical |
| RB-002 | Redis unavailable | Critical |
| RB-003 | PostgreSQL unavailable | Critical |
| RB-004 | FastAPI unreachable | Critical |
| RB-005 | DLQ spike | Critical |
| RB-006 | ALB 5xx rate spike | Critical |
| RB-007 | Queue depth high | Warning |
| RB-008 | Token usage spike | Warning |
| RB-009 | Single agent failure rate high | Warning |
| RB-010 | Reviewer agent degraded | Warning |
| RB-011 | ECS task count below minimum | Warning |
| RB-012 | RDS connection count high | Warning |
| RB-013 | Pydantic validation failure spike | Warning |
| RB-014 | Auth failure rate spike | Warning |
| RB-015 | Deployment rollback | Operational |
| RB-016 | Manual job re-queue | Operational |
| RB-017 | LLM provider outage response | Operational |

---

## RB-001: Fatal Job Failure Rate High

**Alert:** `cf_job_complete_total_FAILED > 5 in 5 minutes`  
**Severity:** Critical — Page on-call

### Symptoms
- CloudWatch alarm fires
- Users reporting "Job failed" in the UI
- `cf_job_complete_total{status="FAILED"}` metric elevated

### Diagnosis

```bash
# 1. Check recent fatal failures in CloudWatch Logs Insights
fields @timestamp, traceId, jobId, agent, message, failure_reason
| filter level = "error" and event = "agent_failed"
| sort @timestamp desc
| limit 20

# 2. Identify which agent is failing most
fields agent, count(*) as failures
| filter level = "error"
| stats count() by agent
| sort failures desc

# 3. Check if it's a provider issue
fields @timestamp, message
| filter message like "Anthropic" or message like "provider"
| sort @timestamp desc
| limit 10
```

**Common root causes:**
- A) LLM provider (Anthropic) returning 500s → see RB-017
- B) Pydantic ValidationError spike on a specific agent → see RB-013
- C) FastAPI unreachable → see RB-004
- D) A recent code deployment broke an agent → see RB-015

### Recovery Steps

1. Identify root cause from diagnosis (A, B, C, or D above)
2. If cause is A (LLM provider): follow RB-017
3. If cause is B (validation): check if a prompt was recently changed — roll back prompt version if so
4. If cause is C (FastAPI): follow RB-004
5. If cause is D (deployment): follow RB-015
6. Once resolved: monitor `cf_job_complete_total{status="FAILED"}` for 10 minutes to confirm recovery
7. Re-queue stuck jobs from DLQ if appropriate (follow RB-016)

### Escalation
- Not resolved in 15 minutes → escalate to Engineering Lead
- Affects > 50% of jobs → post incident status update, consider disabling new job submissions temporarily

---

## RB-002: Redis Unavailable

**Alert:** BullMQ connection errors for > 30 seconds  
**Severity:** Critical — Page on-call

### Symptoms
- `POST /api/v1/projects` returning 503
- BullMQ Worker logs: `Error: connect ECONNREFUSED redis:6379`
- No new jobs being processed
- WebSocket connections may drop (Socket.IO Redis adapter)

### Diagnosis

```bash
# 1. Check ElastiCache status in AWS Console
aws elasticache describe-cache-clusters --region us-east-1

# 2. Check NestJS logs for Redis connection errors
fields @timestamp, message, error
| filter service = "api-nest" and message like "Redis"
| sort @timestamp desc
| limit 20

# 3. Test Redis connectivity from within VPC
# (Use ECS Exec on a running NestJS task)
aws ecs execute-command \
  --cluster cloudforge-prod \
  --task <task-id> \
  --container api-nest \
  --interactive \
  --command "redis-cli -h $REDIS_URL ping"
```

### Recovery Steps

1. **If ElastiCache node is in "modifying" state:** Wait — AWS is performing maintenance. ETA in console.
2. **If ElastiCache node is in "failed" state:**
   - Trigger manual failover (if Multi-AZ enabled): `aws elasticache test-failover --replication-group-id cloudforge-redis`
   - Wait for failover to complete (~30–60 seconds)
3. **If VPC DNS resolution is failing:** Check Route 53 private hosted zone records
4. **If security group misconfiguration:** Verify NestJS SG has outbound rule to ElastiCache SG on port 6379
5. Once Redis recovers: NestJS and Worker will automatically reconnect
6. In-flight BullMQ jobs are persisted — they will resume processing automatically
7. Monitor BullMQ queue depth (`cf_queue_depth`) to confirm jobs are being processed

### Escalation
- Not resolved in 10 minutes → AWS Support ticket (Business Support)
- If total Redis failure: consider temporary degraded mode — disable new job submissions until Redis recovers

---

## RB-003: PostgreSQL Unavailable

**Alert:** Prisma connection errors for > 30 seconds  
**Severity:** Critical — Page on-call

### Symptoms
- All API endpoints returning 503
- Prisma logs: `Can't reach database server at ...`
- NestJS unable to create or read any records

### Diagnosis

```bash
# 1. Check RDS status
aws rds describe-db-instances --region us-east-1 \
  --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus,MultiAZ]'

# 2. Check recent RDS events
aws rds describe-events \
  --source-type db-instance \
  --source-identifier cloudforge-prod-postgres \
  --duration 60

# 3. Check connection count
# CloudWatch → RDS → DatabaseConnections metric
# If near max_connections limit → see RB-012 first
```

### Recovery Steps

1. **If RDS is in "rebooting" state:** Wait (1–3 minutes). This is normal for minor version upgrades or parameter group changes.
2. **If RDS is Multi-AZ and primary failed:**
   - Multi-AZ failover is automatic — takes 60–120 seconds
   - Monitor "Multi-AZ Failover Complete" in RDS events
   - NestJS Prisma connections will automatically reconnect via DNS failover
3. **If Single-AZ and instance failed:**
   - Restore from automated snapshot (latest is < 5 minutes old in production)
   - Update `DATABASE_URL` in Secrets Manager if endpoint changed
   - ECS tasks will pick up new secret on next deployment or task restart
4. **If connection count exhausted:** See RB-012
5. After recovery: verify artifact writes are succeeding with a test job

### Escalation
- Not resolved in 15 minutes → AWS Support ticket
- Data loss suspected → engage Engineering Lead before any restore operations

---

## RB-004: FastAPI Unreachable

**Alert:** NestJS Worker HTTP failures for > 60 seconds  
**Severity:** Critical — Page on-call

### Symptoms
- BullMQ jobs entering retry state
- NestJS Worker logs: `ECONNREFUSED http://ai-service.internal:8000/generate`
- No agent progress events emitted
- Queue depth growing

### Diagnosis

```bash
# 1. Check FastAPI ECS task status
aws ecs list-tasks --cluster cloudforge-prod --service-name ai-fastapi
aws ecs describe-tasks --cluster cloudforge-prod --tasks <task-ids> \
  --query 'tasks[*].[taskArn,lastStatus,healthStatus,stoppedReason]'

# 2. Check FastAPI logs for crash reason
fields @timestamp, level, message, error
| filter service = "ai-fastapi"
| sort @timestamp desc
| limit 50

# 3. Check ECS service events
aws ecs describe-services --cluster cloudforge-prod --services ai-fastapi \
  --query 'services[0].events[:10]'

# 4. Test internal DNS resolution
# ECS Exec into NestJS task:
curl -f http://ai-service.internal:8000/health
```

### Recovery Steps

1. **If FastAPI tasks are stopped/crashed:**
   - Check stopped reason: `aws ecs describe-tasks ... --query 'tasks[*].stoppedReason'`
   - If OOM: increase memory in task definition, redeploy
   - If exit code 1: check application logs for unhandled exception
   - ECS service will automatically restart tasks (desired count maintained)
2. **If FastAPI tasks are running but health check failing:**
   - Check `/health` endpoint manually via ECS Exec
   - Look for dependency failures (LLM SDK init, DB connection on startup)
3. **If tasks are running and healthy but still unreachable:**
   - Check VPC internal DNS: `nslookup ai-service.internal`
   - Check security group rules: NestJS SG → FastAPI SG on port 8000
   - Check ECS service discovery registration
4. While FastAPI is down: BullMQ jobs will retry with backoff — no jobs are lost
5. Once FastAPI recovers: jobs will resume automatically — monitor queue drain rate

### Escalation
- Tasks repeatedly crashing (> 3 restarts in 10 min) → Engineering Lead review
- Security group changes needed → requires infra access

---

## RB-005: DLQ Spike

**Alert:** > 10 jobs in Dead Letter Queue in 5 minutes  
**Severity:** Critical — Page on-call

### Symptoms
- `cf_queue_dlq_total` metric elevated
- Users receiving `job:stuck` WebSocket events
- Jobs not completing

### Diagnosis

```bash
# 1. Check DLQ job details (BullMQ)
# Use Bull Board UI (if enabled) or Redis CLI:
redis-cli lrange bull:generation-queue:failed 0 9

# 2. Check what caused jobs to exhaust retries
fields @timestamp, jobId, traceId, message, error, agent
| filter event = "job:stuck" or event = "job:failed"
| sort @timestamp desc
| limit 20
```

### Recovery Steps

1. Identify root cause of DLQ spike (usually follows RB-001, RB-002, RB-004, or RB-017)
2. **Resolve the underlying root cause first** — re-queuing jobs into a broken system is counterproductive
3. Once root cause resolved, manually re-queue DLQ jobs:

```bash
# Re-queue all DLQ jobs (NestJS admin endpoint — requires admin JWT)
curl -X POST https://api.cloudforge.ai/admin/jobs/requeue-dlq \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

4. Monitor re-queued jobs via `cf_queue_depth` and `cf_job_complete_total`
5. Notify affected users via status page if DLQ affected > 20 users

### Escalation
- DLQ spike persists after root cause resolved → Engineering Lead

---

## RB-006: ALB 5xx Rate Spike

**Alert:** > 5% of requests returning 5xx for > 2 minutes  
**Severity:** Critical — Page on-call

### Symptoms
- Users reporting API errors
- CloudWatch ALB 5xxCount metric elevated
- `cf_job_created_total` drops sharply

### Diagnosis

```bash
# 1. Check ALB access logs for 5xx patterns
# ALB logs in S3: s3://cloudforge-alb-logs/
# Look for: which path, which target, which error code

# 2. Check NestJS error logs
fields @timestamp, traceId, statusCode, path, message
| filter statusCode >= 500
| sort @timestamp desc
| limit 50

# 3. Check ECS NestJS task health
aws ecs describe-tasks --cluster cloudforge-prod \
  --tasks $(aws ecs list-tasks --cluster cloudforge-prod --service-name api-nest --query taskArns --output text)
```

### Recovery Steps

1. **If NestJS tasks are crashing:** ECS will replace them. If cycling repeatedly, check for OOM or startup crash.
2. **If 503s from ALB:** Check that target group has at least 2 healthy targets.
3. **If 500s from application:** Check NestJS logs for unhandled exceptions — may indicate a bad deployment (see RB-015).
4. **If 502s (bad gateway):** FastAPI is likely unreachable — see RB-004.
5. After recovery: verify with test API call before clearing alert.

---

## RB-007: Queue Depth High

**Alert:** Queue depth > 100 for > 5 minutes  
**Severity:** Warning — Notify Slack

### Symptoms
- `cf_queue_depth` metric elevated
- Users experiencing increased wait times
- `cf_queue_wait_ms` P95 increasing

### Diagnosis

Possible causes:
- A) Traffic spike — more jobs submitted than workers can handle
- B) Worker slowdown — FastAPI taking longer per job (LLM latency increase)
- C) Worker crash — fewer workers processing jobs (see RB-004)
- D) Rate limit from LLM provider — jobs taking 2× longer

### Recovery Steps

1. Check `cf_job_duration_ms` P95 — if elevated, it's cause B or D
2. Check `cf_agent_duration_ms` per agent — identify the slowest agent
3. **If traffic spike:** ECS auto-scaling should add NestJS Workers within 2–3 minutes. Verify ECS scaling policy is active.
4. **If worker slowdown:**
   - Check LLM provider status page: https://status.anthropic.com
   - If Anthropic latency elevated: nothing to do — queue will drain when latency normalizes
5. **If workers crashed:** See RB-004
6. Queue depth will self-resolve once root cause is addressed — no manual intervention needed for transient spikes

### Escalation
- Queue depth > 500 for > 15 minutes → Engineering Lead — consider temporarily rate-limiting new submissions

---

## RB-008: Token Usage Spike

**Alert:** Per-job token usage > 3× rolling 1h baseline  
**Severity:** Warning — Notify Slack

### Symptoms
- `cf_agent_cost_usd_total` metric climbing rapidly
- `cf_agent_input_tokens_total` or `cf_agent_output_tokens_total` elevated

### Diagnosis

```bash
# 1. Identify which agent is consuming excess tokens
fields agent, sum(inputTokens) as total_input, sum(outputTokens) as total_output
| filter service = "ai-fastapi"
| stats sum(inputTokens) by agent
| sort total_input desc

# 2. Check if a specific prompt or user is causing the spike
fields userId, jobId, sum(inputTokens) as tokens
| sort tokens desc
| limit 10
```

### Recovery Steps

1. **If one agent is responsible:** Check that agent's `max_tokens` setting in `AGENT_DEFAULTS`. It may have been accidentally increased.
2. **If a user's prompt is unusually long:** Check prompt length validation (should reject > 2000 chars). If validation was bypassed, investigate.
3. **If a prompt version change caused larger outputs:** Consider reverting to previous prompt version (update `packages/shared-config/src/index.ts`).
4. **No immediate action needed** unless cost is approaching per-user cap — in that case, enforce the daily job limit.
5. Monitor for next 30 minutes to confirm spike is not ongoing.

---

## RB-009: Single Agent Failure Rate High

**Alert:** Any agent failure rate > 10% in 5 minutes  
**Severity:** Warning — Notify Slack

### Diagnosis

```bash
# Identify failure reason
fields failure_reason, count(*) as failures
| filter agent = "<failing_agent>" and level = "error"
| stats count() by failure_reason
| sort failures desc
```

**Common failure reasons:**

| Reason | Cause | Fix |
|---|---|---|
| `ValidationError` | LLM output doesn't match Pydantic schema | Check recent prompt changes; may need prompt version rollback |
| `RateLimitError` | LLM provider rate limiting | Reduce concurrency or add request spacing |
| `TimeoutError` | LLM call taking > 60s | Check LLM provider latency; increase timeout if temporary |
| `ContextLengthError` | Input prompt too long | Check upstream agent output sizes |

### Recovery Steps

1. Identify failure reason from logs
2. **If `ValidationError`:** Check if prompt was recently changed. If so, roll back prompt version in `packages/shared-config/src/index.ts`.
3. **If `RateLimitError`:** Reduce `MAX_CONCURRENT_JOBS` config temporarily, or contact LLM provider about quota increase.
4. **If no recent changes:** May be a transient LLM provider issue — monitor for 10 minutes before taking action.

---

## RB-010: Reviewer Agent Degraded

**Alert:** Reviewer failure rate > 5% in 5 minutes  
**Severity:** Warning — Notify Slack

### Context
The Reviewer is the most expensive agent (largest context window). It's the most likely to hit token limits or produce ValidationErrors. It is Mandatory-Retry — jobs degrade to PARTIAL rather than FAILED.

### Recovery Steps

1. Follow RB-009 diagnosis for the reviewer agent specifically
2. Check `cf_agent_input_tokens_total{agent="reviewer"}` — if > 8,000 input tokens, context compression may be needed
3. **Temporary mitigation:** If reviewer is consistently failing, the system continues in PARTIAL mode — users still get all other artifacts. This is acceptable for short periods.
4. **If context length is the issue:** Consider enabling Reviewer context summarization (OQ-014 resolution) — pass summarized versions of non-fatal agent outputs

---

## RB-011: ECS Task Count Below Minimum

**Alert:** NestJS or FastAPI task count < 2  
**Severity:** Warning — Notify Slack

### Diagnosis

```bash
aws ecs describe-services --cluster cloudforge-prod \
  --services api-nest ai-fastapi \
  --query 'services[*].[serviceName,runningCount,desiredCount,pendingCount]'
```

### Recovery Steps

1. **If `runningCount < desiredCount` and `pendingCount > 0`:** Tasks are starting. Wait 60–90 seconds for ECS to provision.
2. **If `runningCount < desiredCount` and `pendingCount = 0`:** Tasks are failing to start.
   - Check ECS stopped task reasons: `aws ecs describe-tasks ... --query 'tasks[*].stoppedReason'`
   - Common causes: port conflict, secret not found in Secrets Manager, image pull failure (bad ECR tag)
3. **If `desiredCount` was manually reduced:** Restore desired count via ECS console or `aws ecs update-service`.
4. System is degraded but functional with 1 running task — not critical unless count drops to 0.

---

## RB-012: RDS Connection Count High

**Alert:** RDS connections > 80% of `max_connections`  
**Severity:** Warning — Notify Slack

### Diagnosis

```bash
# Check max_connections for instance type
# t3.medium: ~170 connections max
# r6g.large: ~2000 connections max

# Check current connection count
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --statistics Average Maximum \
  --period 60 \
  --start-time $(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --dimensions Name=DBInstanceIdentifier,Value=cloudforge-prod-postgres
```

### Recovery Steps

1. **Check if PgBouncer is configured.** If not, this is the root fix — add PgBouncer in Phase 5.
2. **If NestJS ECS tasks scaled out recently:** Each new task opens its own connection pool. This is expected.
3. **Immediate mitigation:** Reduce Prisma `connection_limit` in DATABASE_URL: `?connection_limit=5`
4. **Restart NestJS tasks** if connections are stale (tasks that crashed but didn't release connections).
5. **Long-term fix:** Implement PgBouncer as a connection proxy — Phase 5 infrastructure.

---

## RB-013: Pydantic Validation Failure Spike

**Alert:** Validation failures > 3% in 5 minutes  
**Severity:** Warning — Notify Slack

### Diagnosis

```bash
# Which agent, which field
fields agent, error_detail, count(*) as failures
| filter failure_reason = "ValidationError"
| stats count() by agent, error_detail
| sort failures desc
```

### Common Causes & Fixes

| Cause | Fix |
|---|---|
| Prompt was changed and LLM now returns a different structure | Roll back prompt version in `packages/shared-config/src/index.ts` |
| LLM model was changed (e.g., Haiku → different Haiku version) | Roll back model version in `packages/shared-config/src/index.ts` |
| Schema was changed without prompt update | Update prompt to reflect new schema fields |
| LLM provider returning degraded/partial responses | Check LLM provider status; wait for recovery |

### Recovery Steps

1. Identify the agent and which field is failing validation
2. Check git log for recent changes to `packages/shared-prompts/<agent>/` or `apps/ai-fastapi/models/`
3. If prompt changed: roll back prompt version
4. If schema changed: update prompt to match new schema
5. Run golden dataset test suite to confirm fix before deploying

---

## RB-014: Auth Failure Rate Spike

**Alert:** Auth failures > 20 req/min from single IP  
**Severity:** Warning — Notify Slack

### Diagnosis

This likely indicates a brute-force credential stuffing attack or a misconfigured client.

```bash
# Identify the IP
fields @timestamp, ip, path, statusCode
| filter path like "/auth" and statusCode = 401
| stats count() by ip
| sort count desc
| limit 10
```

### Recovery Steps

1. **If single IP:** AWS WAF rate rule should have already triggered a block (rule: 100 req/5min per IP). Verify WAF is active.
2. **If WAF didn't block:** Manually add IP to WAF IP block list.
3. **If distributed (many IPs):** May indicate credential stuffing — enable CAPTCHA on auth endpoints (requires frontend change).
4. **If internal service (misconfigured client):** Identify the service from User-Agent header and fix the auth configuration.
5. No user data is at risk from failed auth attempts — this is a rate/availability concern, not a breach.

---

## RB-015: Deployment Rollback

**Trigger:** Bad deployment causing elevated errors, crashes, or validation failures  
**Severity:** Operational

### Symptoms
- Error rate increase shortly after a deployment
- ECS tasks repeatedly crashing
- Agent validation failure spike after prompt change

### Recovery Steps

**Option A: Roll back ECS deployment (application code):**

```bash
# List recent task definition revisions
aws ecs describe-task-definition --task-definition api-nest
aws ecs describe-task-definition --task-definition ai-fastapi

# Update service to use previous revision
aws ecs update-service \
  --cluster cloudforge-prod \
  --service api-nest \
  --task-definition api-nest:PREVIOUS_REVISION \
  --force-new-deployment

aws ecs update-service \
  --cluster cloudforge-prod \
  --service ai-fastapi \
  --task-definition ai-fastapi:PREVIOUS_REVISION \
  --force-new-deployment
```

**Option B: Roll back prompt version (prompt change caused ValidationErrors):**

```typescript
// packages/shared-config/src/index.ts
// Change promptVersion back to previous version
export const AGENT_DEFAULTS = {
  planner: { promptVersion: 'v1', ... },  // was 'v2' — rolling back
  ...
}
```

Then redeploy FastAPI.

**Option C: Roll back via GitHub Actions (revert commit + push):**

```bash
git revert HEAD --no-edit
git push origin main
# CI/CD pipeline triggers automatically
```

### Post-Rollback
1. Confirm error rates return to baseline
2. Re-queue any DLQ jobs that failed during the bad deployment (RB-016)
3. Write a brief post-mortem in the PR that caused the issue
4. Fix the root cause before re-deploying

---

## RB-016: Manual Job Re-queue

**Trigger:** Jobs are stuck in DLQ after an infrastructure incident  
**Severity:** Operational

### Prerequisites
- Root cause of failures has been resolved
- System is healthy (no active critical alerts)

### Recovery Steps

```bash
# 1. List DLQ jobs
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.cloudforge.ai/admin/jobs/dlq

# 2. Re-queue all DLQ jobs
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.cloudforge.ai/admin/jobs/requeue-dlq

# 3. Re-queue a specific job
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.cloudforge.ai/admin/jobs/job_xyz/requeue

# 4. Monitor re-queued jobs
watch -n 5 'curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.cloudforge.ai/admin/queue/stats'
```

**Important:** Re-queuing is safe because artifact generation is idempotent (ADR-015). Jobs that were partially completed will resume from the last successful agent.

---

## RB-017: LLM Provider Outage Response

**Trigger:** Anthropic API returning repeated 500/503 errors  
**Severity:** Operational (escalates to Critical if prolonged)

### Check Provider Status
→ https://status.anthropic.com

### Recovery Steps

**If outage is brief (< 15 minutes):**
1. BullMQ will retry jobs automatically with backoff
2. Users see `job:stuck` WebSocket event with informative message
3. Monitor — jobs will resume when provider recovers
4. No manual action needed

**If outage is extended (> 15 minutes):**
1. Post to status page: "LLM provider is experiencing issues. New job submissions are queued and will be processed when service recovers."
2. Consider temporarily disabling new job submissions to prevent further queue buildup:

```bash
# Set DISABLE_NEW_JOBS=true in NestJS environment
# This causes /api/v1/projects to return 503 with a user-friendly message
aws ecs update-service \
  --cluster cloudforge-prod \
  --service api-nest \
  --environment '[{"name":"DISABLE_NEW_JOBS","value":"true"}]'
```

3. When provider recovers: re-enable submissions and re-queue DLQ jobs (RB-016)

**If outage is severe (> 2 hours) and OpenAI fallback is available:**
1. Update `AGENT_DEFAULTS` to use OpenAI GPT-4o (requires OQ-015 resolution — fallback provider configured)
2. Deploy FastAPI with new model configuration
3. Revert when Anthropic recovers

---

## Incident Communication Template

Use this template for Slack incident updates:

```
🚨 INCIDENT: [Brief description]
Status: INVESTIGATING | IDENTIFIED | MONITORING | RESOLVED
Impact: [Number of affected users / jobs]
Start time: [time]
Symptoms: [What users see]
Root cause: [If known]
Current action: [What we're doing]
ETA: [If known]
Runbook: RB-XXX
```
