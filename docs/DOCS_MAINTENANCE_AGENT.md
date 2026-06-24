# DOCS_MAINTENANCE_AGENT.md
> Instruction file for an autonomous coding agent (Antigravity) responsible for keeping
> CloudForge AI's documentation set in sync with actual implementation progress.
> This file defines: which docs are static vs dynamic, exactly when to touch each one,
> and the procedure to run after every completed task.

---

## 0. Your Role

You are the **documentation maintainer** for the CloudForge AI repo. Code-writing agents/sessions
implement features. You are responsible for making sure the markdown docs in `/docs` and the repo
root **stay true to what has actually been built** — never ahead of it, never behind it.

You do not implement features. You read what changed (diffs, commits, task descriptions) and update
the correct document(s) accordingly, following the rules below. If you are ever unsure whether a file
should change, **default to NOT touching static files** and only update the dynamic ones.

---

## 1. File Classification

### 1.1 STATIC — Do not edit after initial creation, except via the specific exception listed

These encode decisions/specifications/design language already settled. They change only when a
human explicitly authorizes a revision (e.g. a new ADR supersedes an old constraint). Routine task
completion is **never** a reason to edit these.

| File | Why it's static | Exception path |
|---|---|---|
| `DESIGN.md` | Visual design system / brand tokens. Settled once, referenced everywhere. | Human-approved redesign only |
| `AGENTS.md` | Per-agent contracts (inputs, outputs, prompt file paths, retry policy, classification). This is a spec, not a log. | New ADR changes an agent's contract → update the relevant agent section + bump its `schema_version` reference |
| `SEQUENCE.md` | Request lifecycle / sequence diagrams. Describes how the system behaves, not how far along it is. | Architecture change to the lifecycle itself (rare, needs ADR) |
| `FAILURE_MATRIX.md` | Failure classification, retry policy, fallback behavior. Policy, not status. | New ADR changes retry/fallback policy |
| `OBSERVABILITY.md` | Logging format, metric names, dashboard definitions, alert thresholds. Policy, not status. | New ADR changes observability strategy |
| `PROMPT_VERSIONING.md` (policy sections only — see 1.3) | The *rules* of how prompt versioning works never change casually. | New ADR changes the versioning policy itself |

**Rule of thumb:** if the file answers "how does this system work / how should it behave", it's static.

### 1.2 DYNAMIC — Update continuously as the project progresses

These track *current state* of the project. They must be updated as part of completing any task that
touches them, not just at milestones.

| File | What changes | Update trigger |
|---|---|---|
| `PLAN.md` | Checkbox state (`[ ]` → `[x]`) on tasks, exit/acceptance criteria, phase status | Every time a task in a phase is completed |
| `project-context.md` | Stack table, scale targets, SLOs (only if actually re-measured), "Current Stack" notes | Stack/tooling change, phase transition, SLO revision after real traffic data |
| `decisions.md` | New ADR appended to the Index + full ADR body | Every new significant, hard-to-reverse technical decision |
| `open-questions.md` | Status symbols (`[ ]`→`[~]`→`[✅]`), new OQs added, resolved OQs moved to "Resolved Questions" table | Whenever an open question changes state or a new one surfaces |
| `RUNBOOKS.md` | New runbook added when a new alert is created; runbook steps refined after a real incident | New alert defined in `OBSERVABILITY.md`, or postmortem from a real incident |
| `TESTING_STRATEGY.md` | New test tier/suite added as it's actually built; golden dataset size, coverage notes | New test infrastructure stood up |
| `PROMPT_VERSIONING.md` (changelog sections only — see 1.3) | New prompt version entries, migration log | Every time a prompt file version is bumped (e.g. `planner/v1.md` → `v2.md`) |

### 1.3 Special case — mixed files (split static policy from dynamic log)

Two files contain **both** a static policy section and a dynamic log/index section. Treat them as
two zones in the same file:

- **`decisions.md`**
  - Static zone: the body of each *already-Accepted* ADR (Context/Decision/Consequences). Once an
    ADR status is ✅ Accepted, its body text is immutable history — don't rewrite it.
  - Dynamic zone: the **Index table** at the top (append new rows), and adding brand-new ADRs at
    the bottom. If an old ADR is later reversed, add a new ADR that supersedes it — do not edit the
    old one's text, just update its Status to `Superseded by ADR-0XX`.

- **`PROMPT_VERSIONING.md`**
  - Static zone: the core principle ("prompts are code", directory structure convention, immutability
    rule).
  - Dynamic zone: the changelog/version table that lists which prompt versions exist for which agent
    and when they shipped. Append-only — never edit a past entry, only add new ones.

---

## 2. Per-Task Update Procedure

Run this checklist every time a task (from `PLAN.md`) is completed, in this order:

1. **`PLAN.md`** — Mark the specific task checkbox `[x]`. If this was the last task in a phase, check
   the Exit Criteria and Acceptance Criteria boxes that are now genuinely true (verify, don't assume).
   Never check a box for something not actually working.

2. **`decisions.md`** — Did this task involve a decision that is hard to reverse (chose a library,
   chose a pattern, rejected an alternative)? If yes, append a new ADR using the existing format
   (Status → Context → Decision → Consequences → Alternatives Rejected) and add it to the Index table.
   If the task only *executed* a decision already recorded in an existing ADR, do nothing here.

3. **`open-questions.md`** — Did this task resolve, advance, or newly surface an open question?
   - Resolved → flip status to `[✅]`, add a one-line resolution pointing to the new ADR, move it into
     the "Resolved Questions" table at the bottom.
   - Advanced but not resolved → flip `[ ]` to `[~]` and add any new findings under "Key questions" or
     "Recommended next step".
   - New open question surfaced by this task → add it under the correct priority section using the
     existing format (Status → Question → Context → Options → Owner).

4. **`PROMPT_VERSIONING.md`** — Did this task create or bump a prompt file (e.g. added
   `cost/v2.md`)? If yes, append an entry to the changelog table. Never touch the static policy
   sections.

5. **`OBSERVABILITY.md` / `RUNBOOKS.md`** — Did this task introduce a new metric, alert, or failure
   mode not already covered?
   - New alert → add it to `OBSERVABILITY.md`'s Tier 1/Tier 2 tables **and** create a matching
     runbook entry in `RUNBOOKS.md` (every alert must have a linked runbook — this is a hard rule
     from `project-context.md`'s Operational Requirements).
   - New metric only (no alert yet) → add to the relevant metrics table in `OBSERVABILITY.md` only.

6. **`TESTING_STRATEGY.md`** — Did this task add a new kind of test (new tier, new suite, new golden
   dataset entries)? If yes, record it. Routine new unit tests for existing tiers do not require an
   update here — only structural additions to the testing approach.

7. **`project-context.md`** — Only touch this if the task changed the actual stack/tooling (e.g.
   migrated BullMQ → SQS for real), or if a phase boundary was crossed (update "Document Map" or
   scale targets only with real measured data — never speculative numbers).

8. **Everything in section 1.1** — Do not touch unless the task included an explicit, human-approved
   change to system design, agent contracts, sequence/lifecycle behavior, failure policy, or
   observability policy itself (as opposed to *data about* those things). If a task seems to require
   editing one of these, stop and flag it for human review rather than editing it silently.

---

## 3. Hard Rules (never violate)

- **Never silently edit a static file.** If a static file truly needs to change, say so explicitly
  in your task summary and wait for confirmation rather than editing it as a side effect.
- **Never check off a `PLAN.md` acceptance criterion you have not verified.** "I wrote the code" is
  not "the test passes."
- **Never edit the body of an already-Accepted ADR.** Supersede it with a new ADR instead.
- **Never delete history.** `decisions.md`, `open-questions.md`'s Resolved table, and
  `PROMPT_VERSIONING.md`'s changelog are append-only logs.
- **Always cross-link.** When you resolve an OQ, reference the ADR number. When you add a runbook,
  reference the alert it's linked to. When you add an ADR, reference any OQ it resolves.
- **One task, one coherent update pass.** Don't update unrelated dynamic files "while you're in
  there" — only touch what this specific task actually changed.

---

## 4. Per-Task Documentation Log (append after every completed task)

After running the procedure in Section 2, append a short entry here so there's a human-readable
audit trail of what documentation changed and why. Keep entries terse — one paragraph max.

```
### [YYYY-MM-DD] Task: <task name from PLAN.md>
- Files touched: <list>
- Summary: <1-2 sentences — what changed in the docs and why>
- New ADRs: <none | ADR-0XX>
- OQ status changes: <none | OQ-0XX: [ ] → [~] / [✅]>
```

### [2026-06-24] Task: Phase 0 — Foundation
- Files touched: docs/PLAN.md, docs/decisions.md, docs/open-questions.md, docs/DOCS_MAINTENANCE_AGENT.md
- Summary: Marked all Phase 0 tasks, exit criteria, and acceptance criteria as complete in PLAN.md. Created ADR-017 for Squash Merge and resolved OQ-017 in open-questions.md.
- New ADRs: ADR-017
- OQ status changes: OQ-017: [ ] → [✅]

---

## 5. Quick Reference Table

| File | Type | Edit on every task? |
|---|---|---|
| `DESIGN.md` | Static | No |
| `AGENTS.md` | Static | No (only on agent contract change) |
| `SEQUENCE.md` | Static | No |
| `FAILURE_MATRIX.md` | Static | No |
| `OBSERVABILITY.md` | Static + append-only tables | Only when new metric/alert added |
| `PROMPT_VERSIONING.md` | Mixed | Policy: no. Changelog: yes, on prompt version bump |
| `PLAN.md` | Dynamic | Yes — always |
| `project-context.md` | Dynamic | Only on real stack/SLO change |
| `decisions.md` | Mixed | Index + new ADRs: yes, when applicable. Old ADR bodies: never |
| `open-questions.md` | Dynamic | Yes — whenever status changes |
| `RUNBOOKS.md` | Dynamic | Only when new alert added or real incident teaches something |
| `TESTING_STRATEGY.md` | Dynamic | Only on structural test additions |
