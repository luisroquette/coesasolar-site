# COESA Structure Retry Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the repaired article-structure provider contract while limiting recovery to two retries at each explicit boundary, without hidden multiplication by the durable workflow.

**Architecture:** `generateArticleStructure` remains the single owner of model recovery: one initial DeepSeek call, one corrected DeepSeek retry, and one GLM fallback. The durable workflow must not replay that whole sequence, and Vercel must schedule only the initial daily run plus two later recovery runs.

**Tech Stack:** TypeScript, Vercel Workflow DevKit, Vercel Cron, Vitest

**Spec:** Production incident on 2026-10-10 for `o que é geração distribuída de energia`, plus the owner requirement that a well-architected system use no more than two retries.

## Global Constraints

- Do not add API calls, models, dependencies, or retry windows.
- Preserve the deployed provider fixes: GLM uses `reasoning_effort: minimal`, localized GLM keys are normalized, and invalid editorial output remains fail-closed.
- Keep exactly one article per business day through the existing idempotent database claim.
- Run typecheck, lint, and tests through `mac-gate`; run the build only in Vercel Preview.

## Review Focus

- The structure generator keeps exactly three model attempts: initial plus two retries.
- The workflow does not replay all three model attempts after they are exhausted.
- The day has exactly three cron windows: initial plus two retries.
- The failure-alert copy continues to name the two remaining retry windows accurately.
- A successful earlier run keeps later cron windows as idempotent no-ops.

## Plan Review Loop

- Pass 1: clarified that provider attempts and daily recovery windows are separate boundaries; the workflow must not multiply either one.
- Pass 2: no substantive improvement found; the diff still reaches the workflow, cron configuration, and both regression contracts.
- Pass 3: no substantive improvement found; release proof avoids a paid duplicate generation because the incident article is already published.

---

### Task 1: Remove duplicate workflow-level structure retries

**Files:**
- Modify: `src/workflows/generate-article.ts`
- Test: `src/workflows/generate-article.regression.test.ts`

**Interfaces:**
- Consumes: `generateArticleStructure(keyword, internalLinks, brief)` with its internal three-attempt model sequence.
- Produces: `generateStructureStep.maxRetries = 0`, preventing a second execution of the exhausted sequence.

- [x] **Step 1: Write the failing regression assertion**

Change the durable-step source assertion to:

```ts
expect(source).toContain('generateStructureStep.maxRetries = 0');
```

- [x] **Step 2: Verify the regression fails**

Run: `mac-gate npx vitest run src/workflows/generate-article.regression.test.ts`

Expected: FAIL because the workflow still configures one outer retry.

- [x] **Step 3: Implement the retry boundary**

Set:

```ts
generateStructureStep.maxRetries = 0;
```

- [x] **Step 4: Verify the focused test passes**

Run: `mac-gate npx vitest run src/workflows/generate-article.regression.test.ts`

Expected: PASS.

### Task 2: Limit daily recovery to two cron retries

**Files:**
- Modify: `vercel.json`
- Test: `src/lib/blog/retry-cron.regression.test.ts`

**Interfaces:**
- Consumes: idempotent `/api/blog/generate` and the existing alert copy naming `13:30` and `18:50` UTC.
- Produces: schedules `0 9 * * 1-5`, `30 13 * * 1-5`, and `50 18 * * 1-5` only.

- [x] **Step 1: Write failing exact-schedule tests**

Assert that the generate cron array has length three and exactly these schedules:

```ts
expect(generateCrons.map(c => c.schedule)).toEqual([
  '0 9 * * 1-5',
  '30 13 * * 1-5',
  '50 18 * * 1-5',
]);
```

- [x] **Step 2: Verify the regression fails**

Run: `mac-gate npx vitest run src/lib/blog/retry-cron.regression.test.ts`

Expected: FAIL because five cron windows still exist.

- [x] **Step 3: Remove the redundant 11:00 and 16:00 UTC schedules**

Delete only those two `/api/blog/generate` entries from `vercel.json`.

- [x] **Step 4: Verify focused and full gates**

Run: `mac-gate npx vitest run src/lib/blog/retry-cron.regression.test.ts src/workflows/generate-article.regression.test.ts src/lib/blog/deepseek.regression.test.ts`

Run: `mac-gate npm run preflight:ci`

Expected: all tests, typecheck, model-retirement check, and lint pass.

### Task 3: Release and verify persisted behavior

**Files:**
- No code files beyond Tasks 1-2.

**Interfaces:**
- Consumes: the dedicated branch, PR checks, and Vercel deployment metadata.
- Produces: merged production configuration with three cron windows and evidence that the 2026-10-10 article remains published.

- [ ] **Step 1: Commit, push, and open one PR**

Use the existing task branch and require the latest SHA to pass CI and Vercel Preview.

- [ ] **Step 2: Merge and monitor production**

Require `main` CI, CodeQL, and Vercel Production to finish green.

- [ ] **Step 3: Verify without paid retrigger**

Read production persistence and deployment configuration. Confirm the incident keyword remains `published`, the run log remains `success`, and the deployed cron list contains one initial run plus two retries. Do not regenerate the already-published article.
