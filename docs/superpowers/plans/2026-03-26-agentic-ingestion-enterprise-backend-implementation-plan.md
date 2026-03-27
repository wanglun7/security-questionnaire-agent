# Agentic Ingestion Enterprise Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 LangGraph ingestion v1 升级为严格对齐 `2026-03-26-agentic-ingestion-enterprise-alignment-spec.md` 的 backend-only 企业级入库链路，补齐厚 contract、结构驱动 chunk strategy、review 后效、partial indexing 和 draft/final 持久化语义。

**Architecture:** 保持 `LangGraph 编排层 + deterministic services 执行层 + PostgreSQL 持久化` 的主干不变，但重做核心 contract 与状态语义。parser、chunk execution、validation、repository 继续保持 deterministic；文档分类、chunk strategy、metadata enrichment、review routing 以结构化 decision layer 方式增强。所有新增语义必须以数据库状态和 typed contract 表达，不允许只存在于内存中。

**Tech Stack:** Next.js 15, TypeScript, LangGraph, Drizzle ORM, PostgreSQL, pgvector, node:test, mammoth, pdf-parse, xlsx, cheerio

---

## File Structure

本计划涉及的 backend 核心文件如下。

- Modify: `lib/db/schema.ts`
- Modify: `lib/ingestion/contracts/chunk.ts`
- Modify: `lib/ingestion/contracts/review.ts`
- Modify: `lib/ingestion/contracts/document.ts`
- Modify: `lib/ingestion/graph/state.ts`
- Modify: `lib/ingestion/storage/types.ts`
- Modify: `lib/ingestion/storage/repositories/chunks.ts`
- Modify: `lib/ingestion/storage/repositories/review-tasks.ts`
- Modify: `lib/ingestion/storage/repositories/ingestion-runs.ts`
- Modify: `lib/ingestion/storage/repositories/index.ts`
- Modify: `lib/ingestion/services/document-classifier.ts`
- Modify: `lib/ingestion/services/chunking.ts`
- Modify: `lib/ingestion/services/enrichment.ts`
- Modify: `lib/ingestion/services/validation.ts`
- Modify: `lib/ingestion/services/indexing.ts`
- Modify: `lib/ingestion/services/parsers/docx.ts`
- Modify: `lib/ingestion/services/parsers/pdf.ts`
- Modify: `lib/ingestion/services/parsers/html.ts`
- Modify: `lib/ingestion/services/parsers/xlsx.ts`
- Modify: `lib/ingestion/graph/nodes/classify-document.ts`
- Modify: `lib/ingestion/graph/nodes/choose-chunk-strategy.ts`
- Modify: `lib/ingestion/graph/nodes/aggregate-enrichment.ts`
- Modify: `lib/ingestion/graph/nodes/validate-chunks.ts`
- Modify: `lib/ingestion/graph/nodes/review-gate.ts`
- Modify: `lib/ingestion/graph/nodes/persist-chunks.ts`
- Modify: `lib/ingestion/graph/nodes/write-vector-index.ts`
- Modify: `lib/ingestion/graph/nodes/finalize-report.ts`
- Modify: `lib/ingestion/graph/builder.ts`
- Create: `lib/ingestion/contracts/decision.ts`
- Create: `lib/ingestion/services/chunk-strategy.ts`
- Create: `lib/ingestion/services/review-routing.ts`
- Create: `lib/ingestion/services/diffing.ts`
- Create: `tests/backend/ingestion/chunk-contract-governance.test.ts`
- Create: `tests/backend/ingestion/review-task-contract.test.ts`
- Create: `tests/backend/ingestion/chunk-strategy.test.ts`
- Create: `tests/backend/ingestion/partial-indexing.test.ts`
- Create: `tests/backend/ingestion/reindex-after-edit.test.ts`
- Modify: `tests/backend/ingestion/document-classifier.test.ts`
- Modify: `tests/backend/ingestion/validation.test.ts`
- Modify: `tests/backend/ingestion/persistence.test.ts`
- Modify: `tests/backend/ingestion/review-interrupt.test.ts`
- Modify: `tests/backend/ingestion/graph-flow.test.ts`
- Modify: `scripts/run-ingestion-smoke.ts`

分层原则：

- contract / schema 先行
- state semantics 先于业务实现
- review/index side effects 先在测试里钉住再落代码
- 所有“部分通过”“编辑后重建索引”“draft/final”语义都必须进入 typed contract 和 DB 字段

---

### Task 1: 加厚 Chunk / ReviewTask / Run contract，先把语义锁死

**Files:**
- Modify: `lib/ingestion/contracts/chunk.ts`
- Modify: `lib/ingestion/contracts/review.ts`
- Modify: `lib/ingestion/graph/state.ts`
- Create: `tests/backend/ingestion/chunk-contract-governance.test.ts`
- Create: `tests/backend/ingestion/review-task-contract.test.ts`

- [ ] **Step 1: 写 Chunk 治理字段失败测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';

test('chunk contract supports governance fields required by enterprise spec', () => {
  const chunk: ChunkContract = {
    chunkId: 'c',
    documentId: 'd',
    rawTextRef: 'raw',
    cleanText: 'clean',
    chunkStrategy: 'section',
    span: { paragraphStart: 1, paragraphEnd: 1 },
    reviewStatus: 'pending',
    indexStatus: 'pending',
    metadataVersion: 1,
    tenant: 'tenant-a',
    checksum: 'hash',
    aclTags: ['internal'],
    authorityLevel: 'medium',
  };

  assert.equal(chunk.indexStatus, 'pending');
  assert.equal(chunk.tenant, 'tenant-a');
});
```

- [ ] **Step 2: 写 ReviewTask 厚 contract 失败测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import type { ReviewTaskContract } from '../../../lib/ingestion/contracts/review';

test('review task contract supports enterprise lifecycle fields', () => {
  const task: ReviewTaskContract = {
    reviewTaskId: 'r',
    ingestionId: 'i',
    documentId: 'd',
    taskType: 'chunk_review',
    reasonCodes: ['POSSIBLE_PROMPT_INJECTION'],
    targetChunkIds: ['c1', 'c2'],
    summary: 'needs review',
    suggestedAction: 'approve',
    status: 'pending',
    resolutionType: 'approved',
  };

  assert.deepEqual(task.targetChunkIds, ['c1', 'c2']);
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/chunk-contract-governance.test.js .test-dist/tests/backend/ingestion/review-task-contract.test.js
```

Expected: FAIL with missing fields in `ChunkContract` / `ReviewTaskContract`

- [ ] **Step 4: 扩展 contract 与状态语义**

最少补齐：

- `ChunkContract`
  - `tenant`
  - `indexStatus`
  - `checksum`
  - `effectiveDate`
  - `version`
  - `authorityLevel`
  - `aclTags`
- `ReviewTaskContract`
  - `taskType`
  - `reasonCodes`
  - `targetDocumentId`
  - `targetChunkIds`
  - `assignee`
  - `owner`
  - `resolutionType`
  - `createdAt`
  - `resolvedAt`
- `IngestionStatus`
  - `INDEXING`
  - `PARTIALLY_INDEXED`

- [ ] **Step 5: 重新运行测试确认通过**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/chunk-contract-governance.test.js .test-dist/tests/backend/ingestion/review-task-contract.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/contracts/chunk.ts lib/ingestion/contracts/review.ts lib/ingestion/graph/state.ts tests/backend/ingestion/chunk-contract-governance.test.ts tests/backend/ingestion/review-task-contract.test.ts
git commit -m "feat: thicken ingestion contracts and statuses"
```

---

### Task 2: 扩展数据库 schema，落地治理字段与 partial indexing 语义

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/ingestion/storage/types.ts`
- Modify: `tests/backend/ingestion/repositories.test.ts`

- [ ] **Step 1: 写失败测试，约束 schema 暴露企业级字段**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { knowledgeChunks, reviewTasks, ingestionRuns } from '../../../lib/db/schema';

test('knowledge chunks schema exposes governance columns', () => {
  assert.ok(knowledgeChunks.indexStatus);
  assert.ok(knowledgeChunks.checksum);
  assert.ok(knowledgeChunks.authorityLevel);
  assert.ok(knowledgeChunks.aclTags);
});

test('review tasks schema exposes lifecycle columns', () => {
  assert.ok(reviewTasks.taskType);
  assert.ok(reviewTasks.reasonCodesJson);
  assert.ok(reviewTasks.resolutionType);
  assert.ok(reviewTasks.resolvedAt);
});

test('ingestion runs schema supports partial indexing status bookkeeping', () => {
  assert.ok(ingestionRuns.status);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/repositories.test.js
```

Expected: FAIL because columns do not exist

- [ ] **Step 3: 扩展 schema 和 storage types**

最低新增：

- `knowledge_chunks`
  - `tenant`
  - `index_status`
  - `checksum`
  - `effective_date`
  - `version`
  - `authority_level`
  - `acl_tags_json`
- `review_tasks`
  - `task_type`
  - `reason_codes_json`
  - `target_chunk_ids_json`
  - `target_document_id`
  - `assignee`
  - `owner`
  - `resolution_type`
  - `resolved_at`
- `ingestion_runs`
  - 保持 `status` 可表达 `PARTIALLY_INDEXED`
  - `metrics_json` 中可记录 `approvedChunks / rejectedChunks / indexedChunks`

- [ ] **Step 4: 生成或补 migration**

Run:

```bash
npx drizzle-kit generate
```

Expected: 生成新的 migration 或明确需要手动 SQL patch

- [ ] **Step 5: 重新运行 schema 测试**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/repositories.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/ingestion/storage/types.ts drizzle tests/backend/ingestion/repositories.test.ts
git commit -m "feat: add enterprise ingestion persistence fields"
```

---

### Task 3: 让 parser 输出真正可用于策略决策的结构信号

**Files:**
- Modify: `lib/ingestion/services/parsers/docx.ts`
- Modify: `lib/ingestion/services/parsers/pdf.ts`
- Modify: `lib/ingestion/services/parsers/html.ts`
- Modify: `lib/ingestion/services/parsers/xlsx.ts`
- Modify: `lib/ingestion/contracts/section.ts`
- Modify: `tests/backend/ingestion/graph-flow.test.ts`

- [ ] **Step 1: 写失败测试，约束 parser 至少能产出策略可消费的 section kinds**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDocxDocument } from '../../../lib/ingestion/services/parsers/docx';

test('docx parser emits normalized section kinds for downstream chunk strategy selection', async () => {
  const result = await parseDocxDocument({
    documentId: 'd',
    sourceUri: '/tmp/docxtemplater-sample/examples/text-example.docx',
  });

  assert.ok(result.sections.every((section) => section.kind));
});
```

- [ ] **Step 2: 运行测试确认当前信号不足**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/graph-flow.test.js
```

Expected: FAIL after assertions are strengthened for section kind distribution

- [ ] **Step 3: 扩展 parser 输出**

要求：

- `docx` 至少识别 `heading` / `paragraph_block`
- `html` 至少识别 `heading` / `paragraph_block` / `table`
- `xlsx` 保持 `row_block`
- `pdf` 至少保持稳定 `paragraph_block`，并预留 future heading detection

- [ ] **Step 4: 重新运行 parser/graph 测试**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/graph-flow.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services/parsers lib/ingestion/contracts/section.ts tests/backend/ingestion/graph-flow.test.ts
git commit -m "feat: enrich parser structural signals"
```

---

### Task 4: 把 chunk strategy 从“文件类型默认值”升级成结构驱动 decision layer

**Files:**
- Create: `lib/ingestion/contracts/decision.ts`
- Create: `lib/ingestion/services/chunk-strategy.ts`
- Modify: `lib/ingestion/services/document-classifier.ts`
- Modify: `lib/ingestion/graph/nodes/choose-chunk-strategy.ts`
- Create: `tests/backend/ingestion/chunk-strategy.test.ts`
- Modify: `tests/backend/ingestion/document-classifier.test.ts`

- [ ] **Step 1: 写失败测试，钉住结构驱动策略选择**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseChunkStrategy } from '../../../lib/ingestion/services/chunk-strategy';

test('row-heavy structures resolve to row strategy', async () => {
  const result = await chooseChunkStrategy({
    docType: 'questionnaire',
    initialChunkingHypothesis: 'section',
    sections: [
      { kind: 'row_block' },
      { kind: 'row_block' },
      { kind: 'row_block' },
    ],
  } as any);

  assert.equal(result.chunkingStrategy, 'row');
  assert.equal(result.reason, 'row_block_dominant');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/chunk-strategy.test.js
```

Expected: FAIL because service does not exist

- [ ] **Step 3: 实现结构驱动策略服务**

要求：

- 输入：
  - `docType`
  - `initialChunkingHypothesis`
  - `priorityFeatures`
  - `sections`
- 输出：
  - `chunkingStrategy`
  - `confidence`
  - `reason`
  - `fallbackStrategy`

最低规则：

- `row_block` dominant -> `row`
- `faq_block` dominant -> `faq`
- `clause_block` dominant -> `clause`
- 默认 -> `section`

- [ ] **Step 4: 修改 classifier 和 choose-chunk-strategy 节点**

要求：

- classifier 只给 `initialChunkingHypothesis`
- 最终 `chunkingStrategy` 由 `chooseChunkStrategy` 决定
- 低置信度必须记录 `fallbackStrategy`

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/chunk-strategy.test.js .test-dist/tests/backend/ingestion/document-classifier.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/contracts/decision.ts lib/ingestion/services/chunk-strategy.ts lib/ingestion/services/document-classifier.ts lib/ingestion/graph/nodes/choose-chunk-strategy.ts tests/backend/ingestion/chunk-strategy.test.ts tests/backend/ingestion/document-classifier.test.ts
git commit -m "feat: add structure-driven chunk strategy decision layer"
```

---

### Task 5: 把 enrichment 从轻量摘要升级成可治理 metadata pipeline

**Files:**
- Modify: `lib/ingestion/services/enrichment.ts`
- Modify: `lib/ingestion/graph/workers/enrichment-worker.ts`
- Modify: `lib/ingestion/contracts/chunk.ts`
- Modify: `tests/backend/ingestion/persistence.test.ts`

- [ ] **Step 1: 写失败测试，约束 enrichment 至少能稳定写结构化 metadata**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichChunk } from '../../../lib/ingestion/services/enrichment';

test('enrichment fills governance-ready metadata fields', async () => {
  const result = await enrichChunk({
    chunkId: 'c',
    documentId: 'd',
    rawTextRef: 'Does the product support SSO?',
    cleanText: 'Does the product support SSO?',
    chunkStrategy: 'faq',
    span: { paragraphStart: 1, paragraphEnd: 1 },
    reviewStatus: 'pending',
    indexStatus: 'pending',
    metadataVersion: 1,
    tenant: 'tenant-a',
    checksum: 'hash',
    aclTags: [],
    authorityLevel: 'low',
  } as any);

  assert.ok(result.title);
  assert.ok(result.summary);
  assert.ok(Array.isArray(result.keywords));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/persistence.test.js
```

Expected: FAIL because enrichment output is too thin

- [ ] **Step 3: 扩展 enrichment service**

最低实现：

- deterministic 先补：
  - `title`
  - `summary`
  - `keywords`
- 预留字段：
  - `entities`
  - `questionsAnswered`
  - `versionGuess`
  - `authorityLevel` normalization
  - `reviewHints`

注意：

- 所有新增字段都必须是结构化输出
- 不允许把 enrichment 失败变成 chunk 丢失

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/persistence.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services/enrichment.ts lib/ingestion/graph/workers/enrichment-worker.ts lib/ingestion/contracts/chunk.ts tests/backend/ingestion/persistence.test.ts
git commit -m "feat: expand enrichment metadata pipeline"
```

---

### Task 6: 把 validation 升级成 hard-fail / soft-warning 分级

**Files:**
- Modify: `lib/ingestion/contracts/review.ts`
- Modify: `lib/ingestion/services/validation.ts`
- Modify: `lib/ingestion/graph/nodes/validate-chunks.ts`
- Modify: `tests/backend/ingestion/validation.test.ts`

- [ ] **Step 1: 写失败测试，固定 validation severity tier**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateChunks } from '../../../lib/ingestion/services/validation';

test('validation distinguishes hard-fail from soft-warning issues', () => {
  const issues = validateChunks([
    {
      chunkId: 'c',
      documentId: 'd',
      rawTextRef: '',
      cleanText: '',
      chunkStrategy: 'section',
      span: {},
      reviewStatus: 'pending',
      indexStatus: 'pending',
      metadataVersion: 1,
      tenant: 'tenant-a',
      checksum: 'hash',
      aclTags: [],
      authorityLevel: 'low',
    } as any,
  ]);

  assert.ok(issues.some((issue) => issue.validationTier === 'hard_fail'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/validation.test.js
```

Expected: FAIL because `validationTier` does not exist

- [ ] **Step 3: 扩展 validation contract 和实现**

最低规则：

- `missing span` -> `hard_fail`
- `empty cleanText` -> `hard_fail`
- `prompt injection` -> `review_required` 或 `hard_fail`
- `chunk too large/small` -> `soft_warning`
- `low metadata quality` -> `soft_warning`

- [ ] **Step 4: 修改 validate node 处理结果**

要求：

- `hard_fail` 触发 review 或 reject 路径
- `soft_warning` 可继续，但必须写入 trace/review signal

- [ ] **Step 5: 重新运行测试**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/validation.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/contracts/review.ts lib/ingestion/services/validation.ts lib/ingestion/graph/nodes/validate-chunks.ts tests/backend/ingestion/validation.test.ts
git commit -m "feat: add validation tiering"
```

---

### Task 7: 把 review gate 写成完整 lifecycle，而不是一次性 approve/reject

**Files:**
- Create: `lib/ingestion/services/review-routing.ts`
- Create: `lib/ingestion/services/diffing.ts`
- Modify: `lib/ingestion/graph/nodes/review-gate.ts`
- Modify: `lib/ingestion/storage/repositories/review-tasks.ts`
- Modify: `lib/ingestion/storage/repositories/chunks.ts`
- Modify: `tests/backend/ingestion/review-interrupt.test.ts`
- Create: `tests/backend/ingestion/reindex-after-edit.test.ts`

- [ ] **Step 1: 写失败测试，固定 edit metadata 后效**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('editing metadata bumps metadata version and marks chunk for reindex', async () => {
  assert.fail('implement me');
});
```

- [ ] **Step 2: 写失败测试，固定部分审核通过语义**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('approving only a subset of chunks can lead to partial indexing', async () => {
  assert.fail('implement me');
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/review-interrupt.test.js .test-dist/tests/backend/ingestion/reindex-after-edit.test.js
```

Expected: FAIL

- [ ] **Step 4: 实现 review lifecycle**

要求：

- `approve_document`
- `reject_document`
- `approve_chunks`
- `reject_chunks`
- `edit_chunk_metadata`

并且：

- 记录 before/after diff
- metadata 编辑后 `metadataVersion + 1`
- 检索相关字段变化 -> `indexStatus = reindex_required`
- resolution 持久化写入 `review_tasks`

- [ ] **Step 5: 重新运行 review 测试**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/review-interrupt.test.js .test-dist/tests/backend/ingestion/reindex-after-edit.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/services/review-routing.ts lib/ingestion/services/diffing.ts lib/ingestion/graph/nodes/review-gate.ts lib/ingestion/storage/repositories/review-tasks.ts lib/ingestion/storage/repositories/chunks.ts tests/backend/ingestion/review-interrupt.test.ts tests/backend/ingestion/reindex-after-edit.test.ts
git commit -m "feat: implement review lifecycle and edit reindex semantics"
```

---

### Task 8: 引入 draft/final 双阶段持久化语义

**Files:**
- Modify: `lib/ingestion/storage/types.ts`
- Modify: `lib/ingestion/graph/nodes/persist-chunks.ts`
- Modify: `lib/ingestion/graph/nodes/write-vector-index.ts`
- Modify: `lib/ingestion/storage/repositories/index.ts`
- Modify: `tests/backend/ingestion/persistence.test.ts`

- [ ] **Step 1: 写失败测试，约束 review 前对象不是纯内存态**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('persist step can save draft artifacts before final indexing', async () => {
  assert.fail('implement me');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/persistence.test.js
```

Expected: FAIL

- [ ] **Step 3: 扩展 storage contract**

至少支持：

- `saveDraftArtifacts`
- `publishIndexedChunks`
- `saveIngestionRunResult`

如果暂不新增物理表，也必须通过 `reviewStatus/indexStatus` 明确表达 draft/final。

- [ ] **Step 4: 调整 persist / index 节点**

要求：

- persist 阶段写 draft artifacts
- index 阶段只处理 `approved` 或 `reindex_required` chunks
- publish 完成后更新 `indexStatus`

- [ ] **Step 5: 重新运行测试**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/persistence.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/storage/types.ts lib/ingestion/graph/nodes/persist-chunks.ts lib/ingestion/graph/nodes/write-vector-index.ts lib/ingestion/storage/repositories/index.ts tests/backend/ingestion/persistence.test.ts
git commit -m "feat: add draft and final persistence semantics"
```

---

### Task 9: 让 run 最终状态支持 partial indexing 和 indexing phase

**Files:**
- Modify: `lib/ingestion/services/indexing.ts`
- Modify: `lib/ingestion/graph/nodes/write-vector-index.ts`
- Modify: `lib/ingestion/graph/nodes/finalize-report.ts`
- Modify: `lib/ingestion/storage/repositories/ingestion-runs.ts`
- Create: `tests/backend/ingestion/partial-indexing.test.ts`

- [ ] **Step 1: 写失败测试，约束 partial indexing 收口**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('run finalizes as PARTIALLY_INDEXED when only some chunks are indexed', async () => {
  assert.fail('implement me');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/partial-indexing.test.js
```

Expected: FAIL

- [ ] **Step 3: 修改 indexing/finalize 逻辑**

要求：

- `write_vector_index` 进入时状态可置为 `INDEXING`
- `finalize_report` 根据 chunk 最终状态收口：
  - 全部 indexed -> `INDEXED`
  - 部分 indexed -> `PARTIALLY_INDEXED`
  - 全部 rejected -> `REJECTED`

- [ ] **Step 4: 重新运行测试**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/partial-indexing.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services/indexing.ts lib/ingestion/graph/nodes/write-vector-index.ts lib/ingestion/graph/nodes/finalize-report.ts lib/ingestion/storage/repositories/ingestion-runs.ts tests/backend/ingestion/partial-indexing.test.ts
git commit -m "feat: add indexing and partial indexing run semantics"
```

---

### Task 10: 做一轮完整回归，验证 spec 与实现一致

**Files:**
- Modify: `tests/backend/ingestion/graph-flow.test.ts`
- Modify: `tests/backend/ingestion/api.test.ts`
- Modify: `tests/backend/ingestion/tracing.test.ts`
- Modify: `scripts/run-ingestion-smoke.ts`

- [ ] **Step 1: 补强端到端测试**

新增断言：

- `PARTIALLY_INDEXED`
- `indexStatus`
- `metadataVersion`
- `resolutionType / resolvedAt`
- `draft -> final` 语义可见

- [ ] **Step 2: 运行完整后端测试**

Run:

```bash
npm run test:backend
```

Expected: 0 failures

- [ ] **Step 3: 构建脚本并运行 smoke**

Run:

```bash
npm run build:scripts
npm run ingestion:smoke
```

Expected: 输出 `status` 为 `INDEXED` 或明确标注 `mode`

- [ ] **Step 4: 如本地有真实环境，再跑真实 docx 回归**

Run:

```bash
node .script-dist/scripts/run-ingestion-smoke.js
```

Expected: 真实 DB/embedding 路径完成且无 schema drift

- [ ] **Step 5: Commit**

```bash
git add tests/backend/ingestion scripts/run-ingestion-smoke.ts
git commit -m "test: cover enterprise ingestion semantics"
```

---

## Execution Notes

### P0

- Task 1
- Task 2
- Task 4
- Task 7
- Task 8
- Task 9

### P1

- Task 3
- Task 5
- Task 6

### P2

- 后续真正引入 LLM-based decision provider
- 更复杂的 PDF structure extraction
- 完整 ACL 执行层

## Non-Negotiables

1. 不允许把 spec 中新增的治理字段裁掉，只保留“能跑通”的最小字段。
2. 不允许跳过 `PARTIALLY_INDEXED` 语义，继续用 `INDEXED` 模糊表示部分成功。
3. 不允许把 `edit_chunk_metadata` 实现成“只改数据库字段，不做 version / diff / reindex”。
4. 不允许把 review 前状态只保留在内存里。
5. 如果实现过程中发现 schema 与真实数据库历史状态冲突，必须先记录兼容策略，再继续实现，不能静默硬改。

