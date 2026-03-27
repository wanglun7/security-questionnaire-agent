# Agentic Ingestion Agent LangGraph v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为知识入库链路落地一个基于 LangGraph 的 v1 ingestion workflow，支持文档分类、结构抽取、chunk/enrichment/validation、人工 review interrupt，以及可持久化恢复的执行状态。

**Architecture:** 这次实现采用 `LangGraph 编排层 + TypeScript service 执行层 + PostgreSQL 持久化`。主图负责状态机、条件路由、worker fan-out 和 interrupt；解析、chunk、enrichment、validation、数据库写入仍保持为独立 service / repository，以便测试、回放和后续替换。

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, PostgreSQL, pgvector, LangGraph (`@langchain/langgraph`, `@langchain/core`, `@langchain/langgraph-checkpoint-postgres`), `xlsx`, `mammoth`, `pdf-parse`, `cheerio`, `node:test`

---

## File Structure

本计划落地后，新增或修改的核心文件如下：

- Modify: `package.json`
- Modify: `lib/db/schema.ts`
- Modify: `drizzle.config.ts`
- Create: `lib/ingestion/contracts/document.ts`
- Create: `lib/ingestion/contracts/section.ts`
- Create: `lib/ingestion/contracts/chunk.ts`
- Create: `lib/ingestion/contracts/review.ts`
- Create: `lib/ingestion/contracts/trace.ts`
- Create: `lib/ingestion/graph/state.ts`
- Create: `lib/ingestion/graph/builder.ts`
- Create: `lib/ingestion/graph/checkpointer.ts`
- Create: `lib/ingestion/graph/nodes/receive-request.ts`
- Create: `lib/ingestion/graph/nodes/load-source-descriptor.ts`
- Create: `lib/ingestion/graph/nodes/classify-document.ts`
- Create: `lib/ingestion/graph/nodes/extract-structure.ts`
- Create: `lib/ingestion/graph/nodes/choose-chunk-strategy.ts`
- Create: `lib/ingestion/graph/nodes/build-chunk-tasks.ts`
- Create: `lib/ingestion/graph/nodes/aggregate-chunks.ts`
- Create: `lib/ingestion/graph/nodes/aggregate-enrichment.ts`
- Create: `lib/ingestion/graph/nodes/validate-chunks.ts`
- Create: `lib/ingestion/graph/nodes/review-gate.ts`
- Create: `lib/ingestion/graph/nodes/persist-chunks.ts`
- Create: `lib/ingestion/graph/nodes/write-vector-index.ts`
- Create: `lib/ingestion/graph/nodes/finalize-report.ts`
- Create: `lib/ingestion/graph/subgraphs/pdf-parser.ts`
- Create: `lib/ingestion/graph/subgraphs/docx-parser.ts`
- Create: `lib/ingestion/graph/subgraphs/xlsx-parser.ts`
- Create: `lib/ingestion/graph/subgraphs/html-parser.ts`
- Create: `lib/ingestion/graph/workers/chunk-worker.ts`
- Create: `lib/ingestion/graph/workers/enrichment-worker.ts`
- Create: `lib/ingestion/services/document-classifier.ts`
- Create: `lib/ingestion/services/chunking.ts`
- Create: `lib/ingestion/services/enrichment.ts`
- Create: `lib/ingestion/services/validation.ts`
- Create: `lib/ingestion/services/indexing.ts`
- Create: `lib/ingestion/services/parsers/pdf.ts`
- Create: `lib/ingestion/services/parsers/docx.ts`
- Create: `lib/ingestion/services/parsers/xlsx.ts`
- Create: `lib/ingestion/services/parsers/html.ts`
- Create: `lib/ingestion/storage/repositories/documents.ts`
- Create: `lib/ingestion/storage/repositories/sections.ts`
- Create: `lib/ingestion/storage/repositories/chunks.ts`
- Create: `lib/ingestion/storage/repositories/ingestion-runs.ts`
- Create: `lib/ingestion/storage/repositories/review-tasks.ts`
- Create: `lib/ingestion/api/start-ingestion.ts`
- Create: `lib/ingestion/api/resume-ingestion.ts`
- Create: `app/api/knowledge/ingestions/route.ts`
- Create: `app/api/knowledge/ingestions/[id]/route.ts`
- Create: `app/api/knowledge/ingestions/[id]/resume/route.ts`
- Create: `tests/backend/ingestion/contracts.test.ts`
- Create: `tests/backend/ingestion/document-classifier.test.ts`
- Create: `tests/backend/ingestion/chunking.test.ts`
- Create: `tests/backend/ingestion/validation.test.ts`
- Create: `tests/backend/ingestion/repositories.test.ts`
- Create: `tests/backend/ingestion/graph-flow.test.ts`
- Create: `tests/backend/ingestion/review-interrupt.test.ts`

边界约束：

- 不修改现有 `lib/rag/*` 的行为。
- 不把 ingestion 与现有问卷回答主链路强耦合。
- 先把 ingestion 做成可独立运行的知识入库入口。

---

### Task 1: 安装依赖并建立 ingestion 目录骨架

**Files:**
- Modify: `package.json`
- Create: `lib/ingestion/contracts/.gitkeep`
- Create: `lib/ingestion/graph/.gitkeep`
- Create: `lib/ingestion/services/.gitkeep`
- Create: `lib/ingestion/storage/.gitkeep`
- Test: `tests/backend/ingestion/contracts.test.ts`

- [ ] **Step 1: 写一个最小失败测试，固定 ingestion 模块入口存在**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('ingestion module placeholders are wired', async () => {
  const stateModule = await import('../../lib/ingestion/graph/state');
  assert.ok(stateModule);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/contracts.test.js
```

Expected: FAIL with `Cannot find module '../../lib/ingestion/graph/state'`

- [ ] **Step 3: 安装依赖并建立空目录/占位文件**

Run:

```bash
npm install @langchain/langgraph @langchain/core @langchain/langgraph-checkpoint-postgres pdf-parse mammoth cheerio zod
```

在 `package.json` 中确认新增依赖，并创建 `lib/ingestion/*` 目录占位文件。

- [ ] **Step 4: 添加最小模块导出**

```ts
// lib/ingestion/graph/state.ts
export type IngestionState = {
  ingestionId: string;
};
```

- [ ] **Step 5: 重新运行测试确认通过**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/contracts.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json lib/ingestion tests/backend/ingestion/contracts.test.ts
git commit -m "chore: scaffold ingestion module"
```

---

### Task 2: 扩展数据库 schema，给 ingestion 独立持久化模型

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `drizzle.config.ts`
- Create: `drizzle/000x_agentic_ingestion.sql`
- Test: `tests/backend/ingestion/repositories.test.ts`

- [ ] **Step 1: 写失败测试，约束新表和关键字段存在**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import * as schema from '../../../lib/db/schema';

test('ingestion schema exports core knowledge tables', () => {
  assert.ok(schema.documents);
  assert.ok(schema.documentSections);
  assert.ok(schema.knowledgeChunks);
  assert.ok(schema.ingestionRuns);
  assert.ok(schema.ingestionStepTraces);
  assert.ok(schema.reviewTasks);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/repositories.test.js
```

Expected: FAIL because exports do not exist

- [ ] **Step 3: 扩展 Drizzle schema**

在 `lib/db/schema.ts` 中新增：

- `documents`
- `documentSections`
- `knowledgeChunks`
- `ingestionRuns`
- `ingestionStepTraces`
- `reviewTasks`

最低字段要求：

```ts
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceUri: text('source_uri').notNull(),
  mimeType: text('mime_type').notNull(),
  originalFilename: text('original_filename').notNull(),
  docType: text('doc_type'),
  checksum: text('checksum'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

`knowledgeChunks.embedding` 统一改为 `vector('embedding', { dimensions: 1024 })`，保持与当前 embedding 维度一致，避免引入新的生产不一致。

- [ ] **Step 4: 生成 migration**

Run:

```bash
npx drizzle-kit generate
```

Expected: create a new SQL migration under `drizzle/`

- [ ] **Step 5: 重新运行 schema 测试**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/repositories.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle.config.ts drizzle
git commit -m "feat: add ingestion persistence schema"
```

---

### Task 3: 定义 typed contracts 和 graph state

**Files:**
- Create: `lib/ingestion/contracts/document.ts`
- Create: `lib/ingestion/contracts/section.ts`
- Create: `lib/ingestion/contracts/chunk.ts`
- Create: `lib/ingestion/contracts/review.ts`
- Create: `lib/ingestion/contracts/trace.ts`
- Create: `lib/ingestion/graph/state.ts`
- Test: `tests/backend/ingestion/contracts.test.ts`

- [ ] **Step 1: 写失败测试，固定 contract 关键字段**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChunkContract } from '../../../lib/ingestion/contracts/chunk';
import type { IngestionState } from '../../../lib/ingestion/graph/state';

test('chunk contract contains review and span fields', () => {
  const chunk: ChunkContract = {
    chunkId: 'chunk_1',
    documentId: 'doc_1',
    rawTextRef: 'blob://1',
    cleanText: 'hello',
    reviewStatus: 'pending',
    chunkStrategy: 'section',
    span: {},
    metadataVersion: 1,
  };

  assert.equal(chunk.reviewStatus, 'pending');
  assert.equal(chunk.chunkStrategy, 'section');
});

test('ingestion state tracks workflow status', () => {
  const state: IngestionState = {
    ingestionId: 'ing_1',
    documentId: 'doc_1',
    sourceUri: '/tmp/a.pdf',
    originalFilename: 'a.pdf',
    mimeType: 'application/pdf',
    status: 'RECEIVED',
  };

  assert.equal(state.status, 'RECEIVED');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/contracts.test.js
```

Expected: FAIL because types/files do not exist

- [ ] **Step 3: 实现 contracts 与 state**

要求：

- contract 文件一类对象一个文件
- `IngestionState` 只保留可序列化字段
- 不在 state 中存文件二进制或全文大文本

最低实现：

```ts
export type SourceSpanContract = {
  page?: number;
  sheetName?: string;
  rowStart?: number;
  rowEnd?: number;
  charStart?: number;
  charEnd?: number;
};
```

- [ ] **Step 4: 重新运行测试确认通过**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/contracts.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/contracts lib/ingestion/graph/state.ts tests/backend/ingestion/contracts.test.ts
git commit -m "feat: add ingestion contracts and state"
```

---

### Task 4: 落文档分类、chunk strategy 和 validation 的纯服务层

**Files:**
- Create: `lib/ingestion/services/document-classifier.ts`
- Create: `lib/ingestion/services/chunking.ts`
- Create: `lib/ingestion/services/validation.ts`
- Test: `tests/backend/ingestion/document-classifier.test.ts`
- Test: `tests/backend/ingestion/chunking.test.ts`
- Test: `tests/backend/ingestion/validation.test.ts`

- [ ] **Step 1: 写失败测试，先固定 rule-first 行为**

```ts
test('classifier maps xlsx questionnaire to row chunking', async () => {
  const result = await classifyDocument({
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalFilename: 'security-questionnaire.xlsx',
    previewText: '问题列\n是否支持SSO',
  });

  assert.equal(result.docType, 'questionnaire');
  assert.equal(result.chunkingStrategy, 'row');
});

test('chunking service creates one task per row-like section', () => {
  const tasks = buildChunkTasks({
    documentId: 'doc_1',
    chunkingStrategy: 'row',
    sections: [
      { sectionId: 's1', documentId: 'doc_1', kind: 'row_block', textRef: 'r1', span: { rowStart: 1, rowEnd: 1 } },
      { sectionId: 's2', documentId: 'doc_1', kind: 'row_block', textRef: 'r2', span: { rowStart: 2, rowEnd: 2 } },
    ],
  });

  assert.equal(tasks.length, 2);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/document-classifier.test.js .test-dist/tests/backend/ingestion/chunking.test.js .test-dist/tests/backend/ingestion/validation.test.js
```

Expected: FAIL because service functions do not exist

- [ ] **Step 3: 实现 rule-first 服务**

要求：

- `classifyDocument` 先根据 MIME 和文件名做 deterministic 路由
- 预留 `llmSuggest*` 扩展点，但 v1 默认不强依赖 LLM
- `buildChunkTasks` 只做任务拆分，不做入库
- `validateChunks` 先做 deterministic checks

最低实现：

```ts
if (mimeType.includes('spreadsheet') || originalFilename.endsWith('.xlsx')) {
  return { docType: 'questionnaire', parserStrategy: 'xlsx', chunkingStrategy: 'row', priorityFeatures: ['table'] };
}
```

- [ ] **Step 4: 重新运行测试确认通过**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/document-classifier.test.js .test-dist/tests/backend/ingestion/chunking.test.js .test-dist/tests/backend/ingestion/validation.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services tests/backend/ingestion/document-classifier.test.ts tests/backend/ingestion/chunking.test.ts tests/backend/ingestion/validation.test.ts
git commit -m "feat: add ingestion classification chunking and validation services"
```

---

### Task 5: 落 parser services 与统一结构抽取结果

**Files:**
- Create: `lib/ingestion/services/parsers/xlsx.ts`
- Create: `lib/ingestion/services/parsers/docx.ts`
- Create: `lib/ingestion/services/parsers/pdf.ts`
- Create: `lib/ingestion/services/parsers/html.ts`
- Create: `lib/ingestion/graph/subgraphs/xlsx-parser.ts`
- Create: `lib/ingestion/graph/subgraphs/docx-parser.ts`
- Create: `lib/ingestion/graph/subgraphs/pdf-parser.ts`
- Create: `lib/ingestion/graph/subgraphs/html-parser.ts`
- Test: `tests/backend/ingestion/graph-flow.test.ts`

- [ ] **Step 1: 写失败测试，固定 parser 统一输出**

```ts
test('xlsx parser normalizes rows into row_block sections', async () => {
  const result = await parseXlsxDocument({
    documentId: 'doc_1',
    sourceUri: 'fixtures/sample.xlsx',
  });

  assert.equal(result.sections[0]?.kind, 'row_block');
  assert.equal(result.document.documentId, 'doc_1');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/graph-flow.test.js
```

Expected: FAIL because parser functions do not exist

- [ ] **Step 3: 先实现无 LangGraph 依赖的 parser services**

要求：

- 每个 parser service 返回统一结构：
  - `document`
  - `sections`
- `xlsx` 按 `sheet -> row_block`
- `docx` 按 `heading / paragraph_block / table`
- `pdf` v1 允许保守输出 `paragraph_block`
- `html` 按 DOM block 输出 `heading / paragraph_block / table`

- [ ] **Step 4: 用 subgraph 包装 parser services**

每个子图只做：

- 接收 `IngestionState`
- 调用对应 parser service
- 返回 `{ document, sections, status: 'PARSED' }`

最低包装：

```ts
export const xlsxParserSubgraph = new StateGraph(ParserState)
  .addNode('parse_xlsx', async (state) => {
    const parsed = await parseXlsxDocument({ documentId: state.documentId, sourceUri: state.sourceUri });
    return { document: parsed.document, sections: parsed.sections };
  });
```

- [ ] **Step 5: 重新运行测试确认通过**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/graph-flow.test.js
```

Expected: PASS for parser normalization cases

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/services/parsers lib/ingestion/graph/subgraphs tests/backend/ingestion/graph-flow.test.ts
git commit -m "feat: add ingestion parser services and parser subgraphs"
```

---

### Task 6: 组装 LangGraph 主图、worker fan-out 和 checkpointer

**Files:**
- Create: `lib/ingestion/graph/checkpointer.ts`
- Create: `lib/ingestion/graph/builder.ts`
- Create: `lib/ingestion/graph/nodes/receive-request.ts`
- Create: `lib/ingestion/graph/nodes/load-source-descriptor.ts`
- Create: `lib/ingestion/graph/nodes/classify-document.ts`
- Create: `lib/ingestion/graph/nodes/extract-structure.ts`
- Create: `lib/ingestion/graph/nodes/choose-chunk-strategy.ts`
- Create: `lib/ingestion/graph/nodes/build-chunk-tasks.ts`
- Create: `lib/ingestion/graph/workers/chunk-worker.ts`
- Create: `lib/ingestion/graph/workers/enrichment-worker.ts`
- Create: `lib/ingestion/graph/nodes/aggregate-chunks.ts`
- Create: `lib/ingestion/graph/nodes/aggregate-enrichment.ts`
- Test: `tests/backend/ingestion/graph-flow.test.ts`

- [ ] **Step 1: 写失败测试，固定 graph 能编译且顺序正确**

```ts
test('ingestion graph compiles and reaches CHUNKED on a simple xlsx input', async () => {
  const graph = await createIngestionGraph({ checkpointer: false });
  const result = await graph.invoke({
    ingestionId: 'ing_1',
    documentId: 'doc_1',
    sourceUri: 'fixtures/sample.xlsx',
    originalFilename: 'sample.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    status: 'RECEIVED',
  });

  assert.equal(result.status, 'CHUNKED');
  assert.ok(result.chunks?.length);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/graph-flow.test.js
```

Expected: FAIL because graph builder does not exist

- [ ] **Step 3: 实现 Postgres checkpointer 工厂**

`lib/ingestion/graph/checkpointer.ts`:

```ts
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

export async function createPostgresCheckpointer() {
  return PostgresSaver.fromConnString(process.env.DATABASE_URL!);
}
```

- [ ] **Step 4: 实现 graph builder**

要求：

- 用 `StateGraph` 组装主图
- parser 用 conditional edges 路由
- chunk / enrichment 用 `Send` 或等价 fan-out
- `thread_id = ingestionId`

- [ ] **Step 5: 重新运行图级测试确认通过**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/graph-flow.test.js
```

Expected: PASS for compile + happy path

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/graph tests/backend/ingestion/graph-flow.test.ts
git commit -m "feat: add ingestion langgraph workflow"
```

---

### Task 7: 实现 enrichment、validation、review interrupt 与 resume

**Files:**
- Create: `lib/ingestion/services/enrichment.ts`
- Create: `lib/ingestion/graph/nodes/validate-chunks.ts`
- Create: `lib/ingestion/graph/nodes/review-gate.ts`
- Create: `lib/ingestion/graph/nodes/persist-chunks.ts`
- Create: `lib/ingestion/graph/nodes/write-vector-index.ts`
- Create: `lib/ingestion/graph/nodes/finalize-report.ts`
- Create: `lib/ingestion/services/indexing.ts`
- Test: `tests/backend/ingestion/review-interrupt.test.ts`

- [ ] **Step 1: 写失败测试，固定 review interrupt 行为**

```ts
import { Command } from '@langchain/langgraph';

test('review gate interrupts on high severity issue and resumes with approval', async () => {
  const graph = await createIngestionGraph();
  const config = { configurable: { thread_id: 'ing_review_1' } };

  const interrupted = await graph.invoke({
    ingestionId: 'ing_review_1',
    documentId: 'doc_1',
    sourceUri: 'fixtures/bad.html',
    originalFilename: 'bad.html',
    mimeType: 'text/html',
    status: 'RECEIVED',
  }, config);

  assert.ok(interrupted.__interrupt__);

  const resumed = await graph.invoke(new Command({
    resume: { action: 'approve_document' },
  }), config);

  assert.equal(resumed.status, 'INDEXED');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/review-interrupt.test.js
```

Expected: FAIL because review gate / interrupt not implemented

- [ ] **Step 3: 实现 enrichment 和 validation 节点**

要求：

- enrichment 只补 metadata，不改写 `cleanText`
- validation 先跑 deterministic 规则
- 高风险 issue 生成 `ReviewTaskContract[]`

- [ ] **Step 4: 实现 `interrupt` 和 `Command({ resume })` 恢复路径**

最低模式：

```ts
const decision = interrupt({
  ingestionId: state.ingestionId,
  issues: state.validationIssues,
  reviewTasks: state.reviewTasks,
});

return { reviewDecision: decision, status: 'VALIDATED' };
```

- [ ] **Step 5: 实现 indexing 与 report 节点**

要求：

- review 未通过的 chunk 不写向量索引
- `write_vector_index` 调用现有 embedding 客户端
- `finalize_report` 输出稳定的 `IngestionReport`

- [ ] **Step 6: 重新运行 review 测试和全量 backend 测试**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/review-interrupt.test.js
npm run test:backend
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/ingestion tests/backend/ingestion
git commit -m "feat: add ingestion review interrupt and indexing flow"
```

---

### Task 8: 提供 API 入口和状态查询/恢复接口

**Files:**
- Create: `lib/ingestion/api/start-ingestion.ts`
- Create: `lib/ingestion/api/resume-ingestion.ts`
- Create: `app/api/knowledge/ingestions/route.ts`
- Create: `app/api/knowledge/ingestions/[id]/route.ts`
- Create: `app/api/knowledge/ingestions/[id]/resume/route.ts`
- Test: `tests/backend/ingestion/graph-flow.test.ts`

- [ ] **Step 1: 写失败测试，固定 API service 语义**

```ts
test('startIngestion returns ingestion id and initial status', async () => {
  const result = await startIngestion({
    documentId: 'doc_1',
    sourceUri: '/tmp/a.pdf',
    mimeType: 'application/pdf',
    originalFilename: 'a.pdf',
  });

  assert.equal(result.status, 'RECEIVED');
  assert.ok(result.ingestionId);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/graph-flow.test.js
```

Expected: FAIL because API entrypoints do not exist

- [ ] **Step 3: 实现 API services**

要求：

- `startIngestion` 负责生成 `ingestionId` 并调用 graph
- `resumeIngestion` 负责以同一 `thread_id` 发送 `Command({ resume })`
- `GET /api/knowledge/ingestions/[id]` 返回当前状态、trace 摘要、是否等待 review

- [ ] **Step 4: 实现 route handlers**

最低返回结构：

```json
{
  "ingestionId": "ing_123",
  "status": "RECEIVED"
}
```

- [ ] **Step 5: 运行 backend 全量测试**

Run:

```bash
npm run test:backend
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/api app/api/knowledge tests/backend/ingestion
git commit -m "feat: add ingestion api endpoints"
```

---

### Task 9: 收尾集成，接入 trace 查询与最小运维脚本

**Files:**
- Modify: `package.json`
- Create: `scripts/run-ingestion-smoke.ts`
- Modify: `README.md` (only if repository already documents setup; otherwise skip)
- Test: `tests/backend/ingestion/graph-flow.test.ts`

- [ ] **Step 1: 写失败测试，固定 smoke script 使用入口**

```ts
test('smoke script dependencies are exposed', async () => {
  const mod = await import('../../../scripts/run-ingestion-smoke');
  assert.ok(mod.runIngestionSmoke);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npx tsc -p tsconfig.test.json && node --test .test-dist/tests/backend/ingestion/graph-flow.test.js
```

Expected: FAIL because script does not exist

- [ ] **Step 3: 增加 smoke script 和 package script**

`package.json`:

```json
{
  "scripts": {
    "test:backend": "...",
    "build:scripts": "tsc -p tsconfig.scripts.json",
    "ingestion:smoke": "npm run build:scripts && node .script-dist/scripts/run-ingestion-smoke.js"
  }
}
```

`scripts/run-ingestion-smoke.ts`:

```ts
export async function runIngestionSmoke() {
  // load one local fixture, invoke startIngestion, print final status
}
```

- [ ] **Step 4: 运行 smoke script 与全量测试**

Run:

```bash
npm run test:backend
npm run build:scripts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/run-ingestion-smoke.ts
git commit -m "chore: add ingestion smoke script"
```

---

## Verification Checklist

- [ ] `npm install` 成功，LangGraph 与 parser 依赖安装完成
- [ ] `npx drizzle-kit generate` 生成 ingestion migration
- [ ] `npm run test:backend` 全量通过
- [ ] `POST /api/knowledge/ingestions` 可启动 graph
- [ ] 高风险文档会触发 `__interrupt__`
- [ ] `POST /api/knowledge/ingestions/[id]/resume` 可继续执行
- [ ] 合格 chunk 会入库并写 embedding
- [ ] 失败 / review / 完成状态都能通过 `GET /api/knowledge/ingestions/[id]` 查询

---

## Notes

- 先保持 `knowledgeChunks.embedding` 与当前 1024 维 embedding 一致，避免一次计划里同时引入模型维度迁移。
- v1 不做 UI；review 先通过 API payload 和测试验证中断/恢复语义。
- 如果 parser 真实样本复杂度超出预期，优先保证 `XLSX + DOCX` 路径稳定，再补强 `PDF + HTML` 的精细抽取，但不要改变主图 contract。
