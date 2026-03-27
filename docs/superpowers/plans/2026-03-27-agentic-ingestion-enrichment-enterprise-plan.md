# Agentic Ingestion Enrichment Enterprise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ingestion 的 enrich 阶段升级成企业级可用形态：按 `executionMode × chunkType × enrichLevel` 路由，支持跳过策略、分类型字段、有限并发、缓存、验证与真实回归，而不是“每个 chunk 默认同步调一次 LLM”。

**Architecture:** 保持 `workflow-first`。LangGraph 只负责编排和状态推进；deterministic policy engine 决定哪些 chunk 需要 enrich、跑到什么 level、提哪些字段；LLM 只在被策略允许时输出结构化 metadata。`strategy_check` 永远跳过 enrich，`full_ingestion` 默认跑 `L2`，并允许按 chunk type 和风险等级降级、跳过或升级。

**Tech Stack:** TypeScript, Next.js backend runtime, LangGraph, Zod, OpenAI structured outputs, Postgres repositories, Node test runner

---

## 0. 研究结论与绑定性设计

### 0.1 外部最佳实践结论

1. **chunking 和 enrichment 是不同层，不应该绑定成一个同步硬前置。**
   - Azure 的 chunking guidance 强调应先根据文档结构选择 chunking 方法，结构化、半结构化、无结构文档应走不同路线，而不是统一切法。
   - Azure 的 enrichment guidance 明确把 `ID / title / summary / rephrasing / keywords / entities` 这类字段视为索引增强字段，是否加什么字段取决于查询体验和数据域，不是无脑全开。

2. **metadata extraction 是一组可组合 transformation，不是一条固定大 prompt。**
   - LlamaIndex 公开模式是 `TitleExtractor / SummaryExtractor / QuestionsAnsweredExtractor / KeywordExtractor / EntityExtractor` 逐层叠加。
   - 这直接支持我们做 `L0 / L1 / L2 / L3` 分层，而不是所有 chunk 都跑同一份 enrichment。

3. **离线 ingestion 的吞吐核心是并发、缓存、批处理，不是逐 chunk 串行。**
   - LlamaIndex Ingestion Pipeline 原生支持 cache 和 parallel processing。
   - OpenAI 官方文档明确说明 Prompt Caching 对重复前缀可显著降低延迟和成本；Batch API 适合异步大批量场景，但有 24h SLA，更适合 backlog / cold backfill，不适合默认在线上传链路。

4. **Structured Outputs 应该成为 enrich 的硬约束，不是“靠 prompt 祈祷输出合法 JSON”。**
   - OpenAI 官方 structured outputs 文档明确说明模型输出可被约束到 JSON Schema，避免缺 key、错 enum。

5. **Enrichment 必须条件化。**
   - Unstructured 的 enrich 不是“所有输入都生成所有增强”，而是依赖文件内容和 partitioning 路径决定是否生成某类增强。
   - 这与我们的 skip policy、row fast path、按 chunk type 分策略完全一致。

### 0.2 对当前系统的直接结论

当前实现还停留在 demo 级做法：

- `aggregate-enrichment` 对所有 chunk 直接 `Promise.all`
- `enrichChunk` 是统一 prompt
- 无 `enrichLevel`
- 无 skip policy
- 无 cache
- 无按 chunk type 的字段/成本模型
- 输出字段与 spec 还有命名偏差：
  - spec 要 `authorityGuess`
  - 当前 provider 输出的是 `authorityLevel`

这块如果不收紧，后面会继续出现三类问题：

1. 成本和时延不可控
2. metadata 噪音大，检索收益不稳定
3. spec 和代码继续漂移

### 0.3 这次实现的绑定性范围

这次 plan 的目标不是“随便把 enrich 做出来”，而是一次性锁死以下 contract：

1. `executionMode × chunkType × enrichLevel`
2. enrich 是否跳过的 deterministic 判定
3. 每类 chunk 在每个 level 允许输出哪些字段
4. bounded concurrency / retry / timeout / cache 的统一执行框架
5. enrich 后 validation / review routing / partial failure 语义
6. 真实 corpus regression 和 live LLM regression 入口

---

## 1. 目标执行矩阵

### 1.1 executionMode

- `strategy_check`
  - 只允许做到 `chunking` 验证结束
  - 永远不进入 enrich
  - 永远不因为 enrich provider 缺失而失败

- `full_ingestion`
  - `runDefaultEnrichLevel = L2`
  - 允许按 chunk type 降级到 `L0/L1`
  - 允许按高风险 chunk 升级到 `L3`
  - 单个 chunk 的 `effectiveChunkEnrichLevel` 必须由 policy engine 最终决定，而不是直接继承 run 默认值

### 1.2 enrichLevel

- `L0`
  - 不做 LLM enrichment
  - 只保留 deterministic / parser / chunker 已有字段
  - 允许 rule-based 补最低 metadata
  - 用于：
    - `strategy_check`
    - 低价值 row
    - 超短 chunk
    - retry 失败后的降级继续执行

- `L1`
  - 目标：最小可读 metadata
  - 字段：
    - `title`
    - `summary`

- `L2`
  - 默认 level
  - 字段：
    - `title`
    - `summary`
    - `keywords`
    - `questionsAnswered`
    - `entities`

- `L3`
  - 面向治理和审核增强
  - 字段：
    - `title`
    - `summary`
    - `keywords`
    - `questionsAnswered`
    - `entities`
    - `versionGuess`
    - `authorityGuess`
    - `reviewHints`

### 1.3 chunkType 策略

- `section`
  - 默认 `L1/L2`
  - 高价值长段落可上 `L2`
  - `L3` 只给高权威政策类 section

- `faq`
  - 默认 `L2`
  - `questionsAnswered` 必须保留
  - `L3` 给高风险 FAQ 或高权威知识

- `clause`
  - 默认 `L2`
  - `summary / keywords / entities / questionsAnswered` 都有价值
  - `L3` 用于版本/权威/风险提示

- `row`
  - 默认 rule-based fast path
  - 只有高价值 row 才允许进入 `L1/L2/L3`
  - 大多数 row 最终停在 `L0`

### 1.4 skip policy

以下 chunk 默认不调 LLM：

- `cleanText` 太短，例如低于 80 字符
- 纯标题或标题+日期
- boilerplate / 重复声明 / 页脚类文本
- header-only row
- 信息密度极低的 row
- 和已有 chunk `checksum + promptVersion + enrichLevel` 完全相同的缓存命中

---

## 2. 文件结构与职责锁定

### 2.1 现有文件需要修改

**Modify:**
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/contracts/chunk.ts`
  - 对齐 spec 的 enrich 输出字段，补齐 enrichment runtime fields
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/contracts/decision.ts`
  - 把 `ChunkEnrichmentDecisionContract` 改成 level-aware / spec-aligned
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/state.ts`
  - 增加 enrich 运行时统计、level、cache hit 等指标
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment.ts`
  - 从“统一 enrich 函数”改成 orchestrated enrichment service
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/llm-decision-provider.ts`
  - 拆成 per-chunk-type prompt builder + schema
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/workers/enrichment-worker.ts`
  - 接受 `EnrichmentPlan`，不再只传 raw chunk
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/nodes/aggregate-enrichment.ts`
  - 改成 bounded concurrency + cache-aware + batch-aware node
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/nodes/validate-chunks.ts`
  - 增加 enrich 输出验证和 review routing 入口
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/builder.ts`
  - 接入 enrich config、状态流和 metrics
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/package.json`
  - 增加 enrich regression 测试命令

### 2.2 建议新增文件

**Create:**
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/contracts/enrichment.ts`
  - `EnrichmentLevel`
  - `EnrichmentPlan`
  - `ChunkEnrichmentRuntime`
  - `EnrichmentCacheEntry`
  - `ChunkEnrichmentResult`

- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-policy.ts`
  - 输入：`executionMode + chunk + document context`
  - 输出：是否 skip、跑哪个 level、需要哪些字段、是否需要 review hints

- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-prompts.ts`
  - 负责 per chunk type / per level 的 prompt builder
  - 固定静态前缀，便于 prompt caching

- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-cache.ts`
  - cache key builder
  - hit/miss policy
  - promptVersion / modelVersion invalidation

- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-validation.ts`
  - 对 enrich 输出做 schema 后置校验
  - 识别 hard fail / soft warning / review required

- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-executor.ts`
  - bounded concurrency
  - retry / timeout
  - cache lookup / writeback
  - deterministic fallback

- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/storage/repositories/enrichment-cache.ts`
  - DB 持久化 cache repository

### 2.3 测试文件

**Create:**
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-policy.test.ts`
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-prompts.test.ts`
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-cache.test.ts`
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-validation.test.ts`
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/aggregate-enrichment.test.ts`
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/live-enrichment-corpus.test.ts`

**Modify:**
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/graph-flow.test.ts`
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/llm-decision-provider.test.ts`
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/live-llm-corpus.test.ts`
- `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/helpers/test-decision-provider.ts`

---

## 3. 关键 contract 先定死

### 3.1 `ChunkEnrichmentDecisionContract`

必须改成 spec 对齐版本：

```ts
type ChunkEnrichmentDecisionContract = {
  title?: string;
  summary?: string;
  keywords?: string[];
  entities?: string[];
  questionsAnswered?: string[];
  versionGuess?: string;
  authorityGuess?: "low" | "medium" | "high";
  reviewHints?: string[];
};
```

关键规则：

1. `authorityGuess` 是 LLM 猜测，不直接覆盖 `authorityLevel`
2. `authorityLevel` 仍然是治理字段，最终来源是：
   - 原始文档已有可信值
   - review 通过的 metadata edit
   - 或明确的后处理映射
3. `enrichment` 失败不能破坏原始 chunk

### 3.2 `EnrichmentPlan`

```ts
type EnrichmentPlan = {
  chunkId: string;
  chunkStrategy: "section" | "faq" | "clause" | "row";
  executionMode: "strategy_check" | "full_ingestion";
  enrichLevel: "L0" | "L1" | "L2" | "L3";
  shouldCallLlm: boolean;
  skipReason?:
    | "strategy_check_mode"
    | "short_chunk"
    | "title_only"
    | "boilerplate"
    | "row_fast_path"
    | "cache_hit";
  requestedFields: Array<
    | "title"
    | "summary"
    | "keywords"
    | "entities"
    | "questionsAnswered"
    | "versionGuess"
    | "authorityGuess"
    | "reviewHints"
  >;
  promptVariant:
    | "section_l1"
    | "section_l2"
    | "section_l3"
    | "faq_l1"
    | "faq_l2"
    | "faq_l3"
    | "clause_l1"
    | "clause_l2"
    | "clause_l3"
    | "row_rule"
    | "row_l1"
    | "row_l2"
    | "row_l3";
  expectedNonEmptyFields: Array<
    | "title"
    | "summary"
    | "keywords"
    | "entities"
    | "questionsAnswered"
    | "versionGuess"
    | "authorityGuess"
    | "reviewHints"
  >;
  policyReasons: string[];
  policySignals?: Record<string, string | number | boolean>;
  cacheKey?: string;
};
```

### 3.3 enrich metrics

运行时至少统计：

```ts
{
  enrichmentMs?: number;
  runDefaultEnrichLevel?: "L0" | "L1" | "L2" | "L3";
  effectiveEnrichLevelCounts?: Partial<Record<"L0" | "L1" | "L2" | "L3", number>>;
  enrichEligibleChunks?: number;
  enrichSkippedChunks?: number;
  enrichLlmChunks?: number;
  enrichCacheHits?: number;
  enrichCacheMisses?: number;
  enrichRetriedChunks?: number;
  enrichFailedChunks?: number;
}
```

---

## 4. 任务拆分

### Task 1: 锁定 enrich contract 与状态语义

**Files:**
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/contracts/enrichment.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/contracts/chunk.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/contracts/decision.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/state.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/contracts.test.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/chunk-contract-governance.test.ts`

- [ ] **Step 1: 写失败测试，锁死 enrich level 和字段命名**

添加断言：
- `authorityGuess` 存在于 decision contract
- `authorityLevel` 不再作为 LLM 直接输出字段
- `state.metrics` 包含 enrich 统计字段

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:backend -- --test-name-pattern="contracts|chunk-contract-governance"`
Expected: FAIL，提示 contract 不匹配或字段缺失

- [ ] **Step 3: 实现最小 contract 变更**

实现：
- 新增 `EnrichmentLevel`
- 新增 `EnrichmentPlan`
- 调整 `ChunkEnrichmentDecisionContract`
- 在 `ChunkContract` 上增加必要 runtime/guess 字段

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:backend -- --test-name-pattern="contracts|chunk-contract-governance"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/contracts tests/backend/ingestion/contracts.test.ts tests/backend/ingestion/chunk-contract-governance.test.ts
git commit -m "refactor: align enrichment contracts with enterprise spec"
```

### Task 2: 实现 deterministic enrich policy engine

**Files:**
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-policy.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-policy.test.ts`

- [ ] **Step 1: 写失败测试，覆盖 `mode × chunk_type × enrich_level`**

至少覆盖：
- `strategy_check` 一律返回 `L0 + shouldCallLlm=false`
- `section` 默认 `L2`
- `faq` 默认 `L2`
- `clause` 默认 `L2`
- `row` 默认 `row_rule` 或 `L0`
- 超短 chunk / boilerplate / title-only 默认 skip

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:backend -- --test-name-pattern="enrichment-policy"`
Expected: FAIL，缺少 policy engine

- [ ] **Step 3: 实现 policy engine**

要求：
- 只用 deterministic 逻辑
- 不调用 LLM
- 输出稳定 `EnrichmentPlan`
- 规则可序列化、可 trace

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:backend -- --test-name-pattern="enrichment-policy"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services/enrichment-policy.ts tests/backend/ingestion/enrichment-policy.test.ts
git commit -m "feat: add enrichment policy engine"
```

### Task 3: 拆 prompt builder，按 chunk type / level 生成结构化 prompt

**Files:**
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-prompts.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/llm-decision-provider.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-prompts.test.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/llm-decision-provider.test.ts`

- [ ] **Step 1: 写失败测试，锁死 prompt contract**

测试点：
- `section_l1` 只请求 `title/summary`
- `faq_l2` 明确 `questionsAnswered`
- `clause_l3` 明确 `versionGuess/authorityGuess/reviewHints`
- `row_rule` 不生成 LLM prompt
- prompt 的静态前缀稳定，变量内容放在尾部，利于 prompt caching

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:backend -- --test-name-pattern="enrichment-prompts|llm-decision-provider"`
Expected: FAIL

- [ ] **Step 3: 实现 prompt builders 和 schema**

要求：
- 每个 prompt variant 单独 builder
- 每个 builder 明确字段定义、边界、空值规则
- 使用 Structured Outputs / Zod schema
- `authorityGuess` 与 `authorityLevel` 语义分离

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:backend -- --test-name-pattern="enrichment-prompts|llm-decision-provider"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services/enrichment-prompts.ts lib/ingestion/services/llm-decision-provider.ts tests/backend/ingestion/enrichment-prompts.test.ts tests/backend/ingestion/llm-decision-provider.test.ts
git commit -m "feat: add typed enrichment prompts by chunk strategy"
```

### Task 4: 实现 enrich cache 和 cache key 策略

**Files:**
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-cache.ts`
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/storage/repositories/enrichment-cache.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/storage/repositories/index.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-cache.test.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/repositories.test.ts`

- [ ] **Step 1: 写失败测试，锁死 cache key**

cache key 必须包含：
- `tenantId`
- `chunk.checksum`
- `chunkStrategy`
- `enrichLevel`
- `promptVariant`
- `promptVersion`
- `outputSchemaVersion`
- `modelId`

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:backend -- --test-name-pattern="enrichment-cache|repositories"`
Expected: FAIL

- [ ] **Step 3: 实现 repository + service**

要求：
- cache 命中不再调用 LLM
- promptVersion 或 modelId 变更后自动 miss
- cache 写入只保存结构化结果，不保存 provider 原始响应

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:backend -- --test-name-pattern="enrichment-cache|repositories"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services/enrichment-cache.ts lib/ingestion/storage/repositories/enrichment-cache.ts lib/ingestion/storage/repositories/index.ts tests/backend/ingestion/enrichment-cache.test.ts tests/backend/ingestion/repositories.test.ts
git commit -m "feat: add enrichment cache repository"
```

### Task 5: 实现 bounded concurrency enrich executor

**Files:**
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-executor.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/workers/enrichment-worker.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/nodes/aggregate-enrichment.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/aggregate-enrichment.test.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/graph-flow.test.ts`

- [ ] **Step 1: 写失败测试，锁死并发与跳过语义**

测试点：
- 并发数受限，不是裸 `Promise.all`
- skip chunk 不调用 provider
- cache hit chunk 不调用 provider
- 单个 chunk enrich 失败不拖垮整批
- `strategy_check` 不进入 enrich
- run 默认 level 和 chunk 实际 level 被区分统计

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:backend -- --test-name-pattern="aggregate-enrichment|graph-flow"`
Expected: FAIL

- [ ] **Step 3: 实现 executor**

要求：
- 自带 promise pool
- `INGESTION_ENRICH_CONCURRENCY` 可配置
- 支持 per chunk retry / timeout
- 失败回落到 deterministic metadata
- 更新 state metrics

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:backend -- --test-name-pattern="aggregate-enrichment|graph-flow"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services/enrichment-executor.ts lib/ingestion/services/enrichment.ts lib/ingestion/graph/workers/enrichment-worker.ts lib/ingestion/graph/nodes/aggregate-enrichment.ts tests/backend/ingestion/aggregate-enrichment.test.ts tests/backend/ingestion/graph-flow.test.ts
git commit -m "feat: add bounded enrichment executor"
```

### Task 6: 实现 enrich output validation 与 review routing

**Files:**
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/enrichment-validation.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/nodes/validate-chunks.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/services/review-routing.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-validation.test.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/review-routing.test.ts`

- [ ] **Step 1: 写失败测试，锁死 enrich 验证规则**

至少覆盖：
- `L1+` 缺 `title/summary` -> soft warning 或 review
- `requestedFields` 不等于 `expectedNonEmptyFields`
- `L2+` 中仅当字段属于 `expectedNonEmptyFields` 时，空值才触发 warning/review
- `L3` 返回 `authorityGuess` / `reviewHints` 非法 -> review
- LLM enrich 失败但 deterministic 有值 -> 不 hard fail 整个 run

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:backend -- --test-name-pattern="enrichment-validation|review-routing"`
Expected: FAIL

- [ ] **Step 3: 实现验证和路由**

要求：
- enrich 问题并入统一 `validationIssues`
- 明确 hard fail / soft warning / review required
- `authorityGuess` 只进 guess 字段，不直接升级治理字段

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:backend -- --test-name-pattern="enrichment-validation|review-routing"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/services/enrichment-validation.ts lib/ingestion/graph/nodes/validate-chunks.ts lib/ingestion/services/review-routing.ts tests/backend/ingestion/enrichment-validation.test.ts tests/backend/ingestion/review-routing.test.ts
git commit -m "feat: validate enriched metadata before review routing"
```

### Task 7: 接入真实 corpus enrich regression

**Files:**
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/enrichment-policy-corpus.test.ts`
- Create: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/live-enrichment-corpus.test.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/helpers/real-corpus-fixtures.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/helpers/test-decision-provider.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/package.json`

- [ ] **Step 1: 先写 deterministic corpus regression，锁死 policy 行为**

样本至少覆盖：
- HR Manual HTML/DOCX/PDF -> `section`
- VTEX FAQ article / FAQ-like sample -> `faq`
- CUAD contract PDF -> `clause`
- VTEX / CUAD row-heavy XLSX -> `row`

每类至少断言：
- 是否跳过
- 跑到哪个 level
- `policyReasons`
- `promptVariant`
- `expectedNonEmptyFields`

- [ ] **Step 2: 运行 deterministic regression 确认失败**

Run: `npm run test:backend -- --test-name-pattern="enrichment-policy-corpus"`
Expected: FAIL

- [ ] **Step 3: 补 live provider regression，验证真实模型输出质量**

每类至少断言：
- 返回结构合法
- 返回的核心字段合理
- provider 波动不影响 deterministic policy regression 的归因

- [ ] **Step 4: 运行 live regression 确认失败**

Run: `npm run test:backend -- --test-name-pattern="live-enrichment-corpus"`
Expected: FAIL

- [ ] **Step 5: 接入 regression 命令**

建议新增脚本：
- `test:backend:enrich-policy-corpus`
- `test:backend:live-enrich`

并支持环境变量：
- `INGESTION_LIVE_LLM_TESTS=1`
- `INGESTION_ENRICH_LIVE_TESTS=1`

- [ ] **Step 6: 运行两层回归**

Run: `npm run test:backend:enrich-policy-corpus`
Expected: PASS

Run: `npm run test:backend:live-enrich`
Expected: PASS，输出四类真实文件的 enrich 行为

- [ ] **Step 7: Commit**

```bash
git add tests/backend/ingestion/enrichment-policy-corpus.test.ts tests/backend/ingestion/live-enrichment-corpus.test.ts tests/backend/ingestion/helpers/real-corpus-fixtures.ts tests/backend/ingestion/helpers/test-decision-provider.ts package.json
git commit -m "test: add live enrichment corpus regression"
```

### Task 8: 接入成本/吞吐指标与 partial enrich 语义

**Files:**
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/state.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/nodes/finalize-report.ts`
- Modify: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/lib/ingestion/graph/builder.ts`
- Test: `/Users/lun/Desktop/manifex/agent/.worktrees/agentic-ingestion-langgraph/tests/backend/ingestion/graph-flow.test.ts`

- [ ] **Step 1: 写失败测试，锁死 partial enrich 结果**

场景：
- 10 个 chunk 中 2 个 enrich 失败，但 deterministic fallback 成功
- run 不进入 `FAILED`
- metrics 正确记录 `enrichFailedChunks`

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:backend -- --test-name-pattern="graph-flow"`
Expected: FAIL

- [ ] **Step 3: 实现 finalize/reporting**

要求：
- enrich 失败不等于 run 失败
- trace 能看见 skip / cache hit / retry / fail
- finalize report 输出 enrich 统计

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:backend -- --test-name-pattern="graph-flow"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/graph/state.ts lib/ingestion/graph/nodes/finalize-report.ts lib/ingestion/graph/builder.ts tests/backend/ingestion/graph-flow.test.ts
git commit -m "feat: report enrichment throughput and partial failures"
```

---

## 5. P0 / P1 / P2 优先级

### P0

必须先做，不做后续都是玩具：

1. enrich contract 对齐 spec
2. deterministic policy engine
3. per chunk type / per level prompt builders
4. bounded concurrency executor
5. skip policy
6. `strategy_check` 和 `full_ingestion` 分流彻底锁死
7. `runDefaultEnrichLevel` 和 `effectiveChunkEnrichLevel` 分离

### P1

决定系统是否能生产用：

1. persistent enrichment cache
2. row fast path
3. enrich output validation
4. review routing 接入 enrich 风险
5. 真实 corpus regression
6. policy reason trace

### P2

决定系统是否能规模化：

1. 吞吐和成本指标
2. partial enrich / retry / resume
3. provider 级异步 batch 抽象
4. backlog/backfill 模式

---

## 6. 关键实现细节约束

### 6.1 不能再做的事

以下做法禁止继续保留：

1. `Promise.all(state.chunks.map(enrich))`
2. 所有 chunk 共用一套 enrichment prompt
3. `row` 默认逐行调 LLM
4. enrich 失败直接炸整条 ingestion
5. LLM 直接写 `authorityLevel`
6. `strategy_check` 暗中调用 enrich
7. 没有 cache key versioning 的“伪缓存”
8. enrichment 回写 chunk boundary / cleanText / source span / source anchor

### 6.2 prompt 设计纪律

每个 prompt variant 必须明确：

1. 字段定义
2. 何时允许返回空数组
3. 不确定时如何保守输出
4. 不得凭空发明未在 chunk 中出现的具体事实
5. 静态 instruction 放前面，chunk 文本放后面，利于 prompt caching

### 6.3 enrichment side-effect 纪律

enrichment 只能补 metadata，不能修改：

1. `cleanText`
2. `contextualText` 的 source-derived 部分
3. `chunkStrategy`
4. `span`
5. `rawTextRef`

如果需要改 chunk 边界、chunk 文本或 source anchor，必须回到 parser/chunking 层处理，不能在 enrich 层静默修正。

### 6.4 governance 字段纪律

`reviewHints` 和其他 enrich 输出只能作为 routing / review signal，不能直接改变：

1. `authorityLevel`
2. `reviewStatus`
3. `documentStatus`
4. `publishedness`
5. 其他治理发布字段

治理字段的正式变更只能来自：

1. 原始可信 source
2. deterministic policy
3. 人工 review 决策
4. 明确记录的后处理映射

### 6.5 row fast path 纪律

`row` 的默认路线必须是：

1. 用表头和单元格做 deterministic metadata
2. 仅对高价值 row 进入 LLM

高价值 row 最低判定信号：

- 非 header row
- 非空核心列数量达到阈值
- 行文本长度达到阈值
- 出现政策 / 合同 / FAQ / 风险关键词

---

## 7. 验收标准

### 7.1 代码级验收

1. `strategy_check` 完全不依赖 enrich provider
2. `full_ingestion` 的 `runDefaultEnrichLevel` 默认 `L2`
3. `section / faq / clause / row` 四类 chunk 的 enrichment 路线不同
4. `row` 不再默认全量 LLM enrichment
5. cache hit 能跳过 provider 调用
6. 并发数可配置，且测试能证明不是无限并发
7. deterministic policy regression 和 live provider regression 分层存在
8. enrichment 不会修改 chunk boundary / span / raw text anchor

### 7.2 测试级验收

必须通过：

```bash
npm run test:backend
npm run test:backend:corpus
npm run test:backend:live-llm
npm run test:backend:enrich-policy-corpus
npm run test:backend:live-enrich
```

### 7.3 真实样本验收

至少覆盖：

- HR Manual DOCX
- HR Manual HTML
- HR Manual PDF
- VTEX FAQ sample
- VTEX row-heavy XLSX
- CUAD contract PDF
- CUAD contract/label XLSX

对每个样本都能回答：

1. chunk strategy 是什么
2. enrich level 是什么
3. 哪些 chunk 被跳过
4. 哪些 chunk 命中 cache
5. 哪些字段由 LLM 生成
6. 为什么这些 chunk 会被跳过 / 升级 / 降级

---

## 8. 实施顺序建议

推荐按下面顺序执行，不要跳步：

1. Task 1
2. Task 2
3. Task 3
4. Task 5
5. Task 4
6. Task 6
7. Task 7
8. Task 8

原因：

- 先锁 contract 和 policy，避免后面 executor / cache 白做
- prompt builder 先定，cache key 才能稳定
- bounded concurrency 先于 cache 落地，先把运行语义改对
- validation / review 要建立在稳定 enrich 输出之上

---

## 9. 参考资料

- Azure chunking phase:
  - https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-chunking-phase
- Azure enrichment phase:
  - https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-enrichment-phase
- LlamaIndex ingestion pipeline:
  - https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/
- LlamaIndex metadata extraction:
  - https://developers.llamaindex.ai/python/framework/module_guides/indexing/metadata_extraction/
- Unstructured enrichment overview:
  - https://docs.unstructured.io/ui/enriching/overview
- OpenAI Structured Outputs:
  - https://platform.openai.com/docs/guides/structured-outputs
- OpenAI Prompt Caching:
  - https://platform.openai.com/docs/guides/prompt-caching
- OpenAI Batch API:
  - https://platform.openai.com/docs/guides/batch

## 10. 完成定义

这次 enrich 阶段完成，不是指“能看到几个 summary 字段”，而是指：

1. enrich 从统一大 prompt 变成企业级分层执行框架
2. `strategy_check` 和 `full_ingestion` 真正分离
3. `row` 不再拖垮生产吞吐
4. enrich 失败不再破坏主链路
5. 真实 corpus regression 能稳定守住行为
