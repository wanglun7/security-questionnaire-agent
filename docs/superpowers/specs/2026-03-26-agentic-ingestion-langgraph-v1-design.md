# Agentic Ingestion Agent LangGraph v1 设计文档

**日期:** 2026-03-26  
**状态:** Draft  
**作者:** Codex  
**范围:** `Agentic Knowledge` 中 `Agentic Ingestion Agent` 的 v1 可落地实现

---

## 1. 文档目标

本文档定义 `Agentic Ingestion Agent` 的 **LangGraph v1 实现方案**。

目标不是讨论“理论上怎样做一个知识库”，而是回答下面这个工程问题：

**如何用 LangGraph 把原始文档入库流程做成一个可恢复、可审计、可人工复核、可扩展的知识加工状态机。**

本文档只覆盖 ingestion 层，不覆盖 retrieval、answering、learning loop 的完整实现。

---

## 2. 背景与问题定义

`Agentic Knowledge` 里对 ingestion 的定义不是“把文件转文本再切 chunk”，而是：

1. 将原始文件转成可治理的知识对象。
2. 在入库前完成结构抽取、chunk 策略选择、metadata enrichment、质量校验。
3. 对低质量、高风险、冲突性内容进入人工复核。
4. 全流程必须可回放、可审计、可重跑。

这意味着 ingestion 不是一个单次脚本，而是一条有状态的工作流。

如果直接用普通函数串起来，短期能跑，但会很快遇到以下问题：

- 文档解析失败后很难从中间状态恢复
- enrichment 与 validation 缺少统一 trace
- review-required 无法优雅暂停并等待人工处理
- 不同文档类型的分支逻辑容易散落在代码各处
- 后续加入 PDF / DOCX / HTML / XLSX 时会出现流程复制

因此 v1 需要一个 **workflow-first** 的编排层。

---

## 3. 为什么选 LangGraph

### 3.1 结论

v1 推荐采用：

**LangGraph 作为编排层 + TypeScript 服务函数作为执行层**

而不是：

- 纯普通函数串联
- 纯“聊天 agent”式自由调用
- 一切逻辑都塞进单个 LLM prompt

### 3.2 选择理由

LangGraph 适合 ingestion 的核心原因是它天然支持：

1. **StateGraph**
   适合表达 `RECEIVED -> CLASSIFIED -> PARSED -> CHUNKED -> ENRICHED -> VALIDATED -> INDEXED` 这类有显式状态的流程。

2. **Conditional Edges**
   适合按 `docType / parserStrategy / chunkingStrategy` 做分支路由。

3. **Subgraph**
   适合为 PDF、DOCX、XLSX、HTML 建独立处理子图，同时对主图暴露统一 contract。

4. **Persistence / Durable Execution**
   适合长流程和失败恢复。尤其是文档处理存在外部依赖、模型调用、数据库写入，不应每次失败后从头再跑。

5. **Interrupt / Human-in-the-loop**
   适合 `REVIEW_REQUIRED` 场景：暂停图执行，等待人工确认，再继续后续索引写入。

### 3.3 非目标

本方案不追求：

- 让 LLM 自主决定所有步骤
- 做 ReAct 风格通用 agent loop
- 在 v1 就实现完整多租户 ACL 治理
- 在 v1 就实现复杂自学习修复闭环

**v1 的核心是“可控的 agentic workflow”，不是“尽可能 agent 化”。**

---

## 4. v1 设计原则

### 4.1 Workflow where possible, agent where necessary

下面这些环节优先 deterministic：

- 文件读取与解析
- source span 抽取
- 结构树标准化
- chunk 边界执行
- schema 校验
- 数据持久化

下面这些环节允许有限 agent 决策：

- 文档分类
- parser / chunk 策略选择
- metadata enrichment
- review routing

### 4.2 Contract-first

图中每个节点都必须输入输出显式结构化对象，禁止节点之间传递自由文本协议。

### 4.3 Side-effect isolation

非幂等 side effects 必须集中处理，避免 durable execution 恢复时重复写入。

### 4.4 Replayable by design

每个关键节点输出必须能落库或被 checkpoint 保存，以支持：

- 调试
- 失败恢复
- 审计
- 质量分析

---

## 5. v1 范围

### 5.1 支持的输入格式

v1 支持：

- `PDF`
- `DOCX`
- `XLSX`
- `HTML`

### 5.2 支持的 chunk 策略

v1 支持：

- `section`
- `faq`
- `clause`
- `row`

### 5.3 支持的处理能力

v1 必须支持：

- 文档分类
- 结构抽取
- chunk strategy 决策
- chunk enrichment
- 基础 validation
- review interrupt
- chunk 入库与索引写入
- ingestion trace 持久化

### 5.4 v1 不做

- 图像深度理解
- 多语言复杂对齐
- 自动 authority 裁决
- 自动版本冲突裁决
- 完整 ACL 执行层
- 自动修复闭环

---

## 6. 系统边界

`Agentic Ingestion Agent` 的职责到此为止：

输入：

- 原始文件或外部文档 URI
- 上传元信息
- 可选业务上下文

输出：

- `Document`
- `Section[]`
- `Chunk[]`
- `IngestionReport`
- `ReviewTask[]`

它**不负责**：

- 用户问答
- 检索规划
- 最终回答生成
- 学习闭环修复

---

## 7. 总体架构

### 7.1 设计结论

采用三层架构：

1. **API / Trigger Layer**
   接收上传请求、创建 ingestion job、启动 graph。

2. **LangGraph Orchestration Layer**
   负责状态机、路由、并行 fan-out、暂停/恢复、checkpoint。

3. **Execution Services Layer**
   由普通 TypeScript 函数实现文档解析、结构标准化、chunk 执行、enrichment、validation、数据库写入。

### 7.2 核心原则

LangGraph 只负责“流程编排”和“状态推进”，不负责替代所有业务逻辑。

换句话说：

- **graph 决定下一步做什么**
- **service 函数决定这一步怎么做**

---

## 8. LangGraph 主图设计

### 8.1 主图节点

v1 主图定义如下：

```text
START
  -> receive_ingestion_request
  -> load_source_descriptor
  -> classify_document
  -> choose_parser_subgraph
  -> extract_structure
  -> choose_chunk_strategy
  -> build_chunk_tasks
  -> run_chunk_workers
  -> aggregate_chunks
  -> run_enrichment_workers
  -> aggregate_enrichment
  -> validate_chunks
  -> review_gate
    -> interrupt_for_review (if needed)
  -> persist_chunks
  -> write_vector_index
  -> finalize_report
END
```

### 8.2 主图状态流转

主图的业务状态与 spec 中的状态机保持一致：

```text
RECEIVED
  -> CLASSIFIED
  -> PARSED
  -> CHUNKED
  -> ENRICHED
  -> VALIDATED
  -> REVIEW_REQUIRED
  -> INDEXED
```

失败分支：

- `PARSE_FAILED`
- `ENRICH_FAILED`
- `REJECTED`
- `FAILED`

### 8.3 为什么是主图 + worker，而不是单个大节点

原因：

- 每个阶段都需要独立 trace
- chunk / enrichment / validation 存在天然并行性
- 审核暂停点必须显式存在
- 将来要替换 PDF / DOCX 子流程时不能影响主图

---

## 9. State 设计

### 9.1 设计要求

graph state 必须满足：

- 纯 JSON 可序列化
- 尽量轻量
- 不直接存大文件二进制
- 不直接存超大全文正文
- 适合作为 checkpoint 和 replay 输入

### 9.2 推荐状态结构

```ts
type IngestionState = {
  ingestionId: string
  documentId: string
  tenantId?: string

  sourceUri: string
  originalFilename: string
  mimeType: string
  uploadedBy?: string
  sourceTags?: string[]

  status:
    | "RECEIVED"
    | "CLASSIFIED"
    | "PARSED"
    | "CHUNKED"
    | "ENRICHED"
    | "VALIDATED"
    | "REVIEW_REQUIRED"
    | "INDEXED"
    | "PARSE_FAILED"
    | "ENRICH_FAILED"
    | "REJECTED"
    | "FAILED"

  docType?: "faq" | "policy" | "contract" | "questionnaire" | "product_doc"
  parserStrategy?: "pdf" | "docx" | "xlsx" | "html"
  chunkingStrategy?: "section" | "faq" | "clause" | "row"
  priorityFeatures?: string[]

  document?: DocumentContract
  sections?: SectionContract[]
  chunkTasks?: ChunkTaskContract[]
  chunks?: ChunkContract[]
  validationIssues?: ValidationIssueContract[]
  reviewTasks?: ReviewTaskContract[]

  metrics?: {
    parseMs?: number
    chunkMs?: number
    enrichmentMs?: number
    validationMs?: number
    totalChunks?: number
  }

  trace?: StepTraceContract[]
  error?: {
    code: string
    message: string
    node?: string
  }
}
```

### 9.3 不进入 state 的内容

下列内容不直接进入 graph state：

- 原始文件二进制
- 全量 page text dump
- 每个 chunk 的超长原文全文
- 原始 parser 中间临时产物

这些内容应写入对象存储、文件系统或数据库，state 中只保留引用 ID 或摘要。

---

## 10. Typed Contracts

### 10.1 DocumentContract

```ts
type DocumentContract = {
  documentId: string
  sourceUri: string
  mimeType: string
  docType: string
  title?: string
  language?: string
  checksum?: string
  pageCount?: number
  sectionCount?: number
  createdAt: string
}
```

### 10.2 SectionContract

```ts
type SectionContract = {
  sectionId: string
  documentId: string
  parentSectionId?: string
  title?: string
  level?: number
  kind: "heading" | "paragraph_block" | "table" | "faq_block" | "clause_block" | "row_block"
  textRef: string
  span: SourceSpanContract
}
```

### 10.3 SourceSpanContract

```ts
type SourceSpanContract = {
  page?: number
  sheetName?: string
  rowStart?: number
  rowEnd?: number
  paragraphStart?: number
  paragraphEnd?: number
  charStart?: number
  charEnd?: number
}
```

### 10.4 ChunkContract

```ts
type ChunkContract = {
  chunkId: string
  documentId: string
  sectionId?: string

  rawTextRef: string
  cleanText: string
  contextualText?: string

  title?: string
  summary?: string
  keywords?: string[]
  entities?: string[]
  questionsAnswered?: string[]

  versionGuess?: string
  authorityGuess?: "low" | "medium" | "high"
  reviewStatus: "pending" | "approved" | "review_required"

  chunkStrategy: "section" | "faq" | "clause" | "row"
  span: SourceSpanContract

  metadataVersion: number
}
```

### 10.5 ChunkTaskContract

```ts
type ChunkTaskContract = {
  taskId: string
  documentId: string
  sectionId?: string
  chunkingStrategy: "section" | "faq" | "clause" | "row"
  textRef: string
  span: SourceSpanContract
}
```

### 10.6 ValidationIssueContract

```ts
type ValidationIssueContract = {
  issueId: string
  chunkId?: string
  severity: "low" | "medium" | "high"
  code:
    | "CHUNK_TOO_SMALL"
    | "CHUNK_TOO_LARGE"
    | "MISSING_LINEAGE"
    | "MISSING_SOURCE_SPAN"
    | "POSSIBLE_PROMPT_INJECTION"
    | "POSSIBLE_VERSION_CONFLICT"
    | "LOW_METADATA_QUALITY"
  message: string
  requiresHumanReview: boolean
}
```

### 10.7 ReviewTaskContract

```ts
type ReviewTaskContract = {
  reviewTaskId: string
  ingestionId: string
  documentId: string
  scope: "document" | "chunk"
  scopeRefId: string
  reasonCode: string
  summary: string
  suggestedAction: "approve" | "edit" | "reject"
}
```

### 10.8 StepTraceContract

```ts
type StepTraceContract = {
  traceId: string
  ingestionId: string
  nodeName: string
  status: "started" | "completed" | "failed" | "interrupted"
  startedAt: string
  finishedAt?: string
  inputSummary?: Record<string, unknown>
  outputSummary?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
}
```

### 10.9 IngestionReport

```ts
type IngestionReport = {
  ingestionId: string
  documentId: string
  status: string
  docType: string
  parserStrategy: string
  chunkingStrategy: string
  totalSections: number
  totalChunks: number
  validationIssueCount: number
  reviewTaskCount: number
  startedAt: string
  finishedAt: string
}
```

---

## 11. 节点设计

### 11.1 `receive_ingestion_request`

职责：

- 接收 API 或 job queue 传入的文档元信息
- 生成 `ingestionId`
- 初始化 graph state

输入：

- `documentId`
- `sourceUri`
- `mimeType`
- `originalFilename`
- `uploadedBy`

输出：

- 初始 `IngestionState`
- `status = RECEIVED`

实现方式：

- deterministic service

### 11.2 `load_source_descriptor`

职责：

- 读取文档的基础元信息
- 校验文件是否存在、是否可读
- 生成 checksum 或 source descriptor

实现方式：

- deterministic service

失败处理：

- 文件不存在 -> `FAILED`
- MIME 类型不支持 -> `REJECTED`

### 11.3 `classify_document`

职责：

- 识别文档类型
- 选择 parser strategy
- 选择 chunking strategy 候选
- 输出 priority features

输入：

- 文件预览片段
- 文件名
- MIME 类型
- 来源标签

输出：

- `docType`
- `parserStrategy`
- `chunkingStrategy`
- `priorityFeatures`

实现方式：

- LLM + structured output
- 输出值必须是有限枚举

约束：

- 模型只能分类，不能直接写 chunk 内容
- 如果分类置信度过低，可走保守默认策略

### 11.4 `choose_parser_subgraph`

职责：

- 将主图路由到对应 parser 子图

分支：

- `pdf_parser_subgraph`
- `docx_parser_subgraph`
- `xlsx_parser_subgraph`
- `html_parser_subgraph`

实现方式：

- conditional edge

### 11.5 parser subgraph

#### 11.5.1 共同职责

每个 parser 子图负责：

- 文档读取
- 原始结构解析
- 文本块标准化
- source span 提取
- 输出统一 `DocumentContract + SectionContract[]`

#### 11.5.2 子图原则

子图内部尽量 deterministic：

- PDF -> 页、段、标题、表格占位
- DOCX -> heading、paragraph、table
- XLSX -> sheet、logical row、cell span
- HTML -> DOM block、heading、list、table

LLM 不负责原始解析，仅可用于：

- 结构修复
- block 类型补全

### 11.6 `extract_structure`

职责：

- 将 parser 子图产物归一化成统一 `Section[]`
- 建立 section tree

输出：

- `DocumentContract`
- `SectionContract[]`
- `status = PARSED`

### 11.7 `choose_chunk_strategy`

职责：

- 根据 `docType + sections + parser hints` 选择最终 chunk 策略

策略规则：

- FAQ -> `faq`
- 合同 -> `clause`
- 政策/白皮书 -> `section`
- 表格/问卷 -> `row`
- 产品说明 -> `section` 或 `feature-like section`

实现方式：

- rule-first
- LLM 仅在边界不清晰时给建议

### 11.8 `build_chunk_tasks`

职责：

- 根据 `sections` 生成 `ChunkTaskContract[]`
- 为后续 fan-out worker 做任务拆分

输出：

- 每个任务包含：
  - `taskId`
  - `sectionId`
  - `chunkingStrategy`
  - `sourceSpan`
  - `textRef`

实现方式：

- deterministic service

### 11.9 `run_chunk_workers`

职责：

- 并行执行 chunk 切分

方式：

- 使用 LangGraph worker fan-out
- 每个 worker 处理一个 `ChunkTask`

worker 输出：

- `ChunkContract[]`

### 11.10 `aggregate_chunks`

职责：

- 合并所有 chunk worker 结果
- 补齐 chunk order / lineage
- 更新 `status = CHUNKED`

### 11.11 `run_enrichment_workers`

职责：

- 对每个 chunk 并行生成 metadata enrichment

生成字段：

- `title`
- `summary`
- `keywords`
- `entities`
- `questionsAnswered`
- `versionGuess`
- `authorityGuess`
- `reviewStatus` 初判

实现方式：

- LLM + structured output
- 每 chunk 一个 worker

约束：

- enrichment 只补 metadata，不允许改写 `cleanText`
- 不允许丢失 source lineage

### 11.12 `aggregate_enrichment`

职责：

- 合并 enrichment 输出
- 回填 chunk metadata
- 更新 `status = ENRICHED`

### 11.13 `validate_chunks`

职责：

- 对 enrichment 后的 chunk 做质量门控

deterministic checks：

- 长度异常
- 缺 sectionId / documentId
- 缺 span
- 缺 cleanText
- questionsAnswered 为空但 chunk 类型要求有

LLM-assisted checks：

- prompt injection 风险
- 可能版本冲突
- metadata 语义质量过低
- 是否需要人工复核

输出：

- `ValidationIssueContract[]`
- `ReviewTaskContract[]`
- `status = VALIDATED` 或 `REVIEW_REQUIRED`

### 11.14 `review_gate`

职责：

- 判断是否需要人工复核

进入 review 的条件：

- 存在 `high severity` issue
- 存在 prompt injection 风险
- 存在明显版本冲突
- authority / metadata 明显不可靠
- 文档整体解析质量过低

### 11.15 `interrupt_for_review`

职责：

- 暂停图执行
- 将 review payload 暴露给人工审核界面

人工可做的动作：

- approve
- edit chunk metadata
- reject chunk
- reject document

恢复后输出：

- 规范化后的 review decision
- 更新后的 chunk / review status

### 11.16 `persist_chunks`

职责：

- 将 `Document / Section / Chunk / ReviewTask / ValidationIssue` 写入数据库

实现方式：

- 幂等写入
- 以 `ingestionId + chunkId` 做自然去重

### 11.17 `write_vector_index`

职责：

- 为合格 chunk 生成 embedding
- 写入向量字段或独立索引表

注意：

- review 未通过的 chunk 默认不入检索索引
- 支持延迟重建

### 11.18 `finalize_report`

职责：

- 生成 `IngestionReport`
- 写入 ingestion run 表
- 更新 `status = INDEXED`

---

## 12. 子图设计

### 12.1 PDF 子图

目标：

- 页级读取
- 段落、标题、表格占位解析
- 保留 page span

注意：

- v1 不做图像 OCR 深度理解
- 图片只保留占位与引用

### 12.2 DOCX 子图

目标：

- heading / paragraph / table 标准化
- 保留段落索引与 section tree

### 12.3 XLSX 子图

目标：

- sheet -> logical row 标准化
- 适配问卷/表格文档
- 保留 `sheetName + row range`

### 12.4 HTML 子图

目标：

- DOM block -> section tree
- heading/list/table 归一化

---

## 13. 并行模型

### 13.1 哪些环节并行

v1 并行发生在：

- chunk worker
- enrichment worker
- 部分 validation worker

### 13.2 并行原则

- 并行单元必须彼此独立
- worker 输入必须是稳定 contract
- worker 输出必须可聚合
- worker 内部异常不能直接使主图崩溃

### 13.3 聚合要求

聚合节点必须：

- 保持顺序稳定
- 标准化错误结果
- 补齐 lineage
- 输出统一结构

---

## 14. Review 与 Human-in-the-loop

### 14.1 设计目标

不是所有 validation issue 都需要人工介入。

v1 只对高风险与高不确定性情况进入 interrupt。

### 14.2 Review Payload

推荐 interrupt payload：

```ts
type IngestionReviewPayload = {
  ingestionId: string
  documentId: string
  documentTitle?: string
  issues: ValidationIssueContract[]
  reviewTasks: ReviewTaskContract[]
  candidateChunks: ChunkContract[]
}
```

### 14.3 人工动作

人工审核界面至少支持：

- `approve_document`
- `approve_chunks`
- `edit_chunk_metadata`
- `reject_chunks`
- `reject_document`

### 14.4 恢复策略

恢复时必须带回结构化 decision，不允许 UI 直接返回自由文本。

---

## 15. 持久化设计

### 15.1 Graph Checkpointer

v1 使用 Postgres checkpointer。

建议：

- `thread_id = ingestionId`
- 一个文档入库过程对应一个 graph thread

### 15.2 数据表建议

v1 至少新增以下表：

#### `documents`

- `id`
- `source_uri`
- `mime_type`
- `original_filename`
- `doc_type`
- `checksum`
- `created_at`

#### `document_sections`

- `id`
- `document_id`
- `parent_section_id`
- `kind`
- `title`
- `text_ref`
- `span_json`

#### `knowledge_chunks`

- `id`
- `document_id`
- `section_id`
- `raw_text_ref`
- `clean_text`
- `contextual_text`
- `title`
- `summary`
- `keywords_json`
- `entities_json`
- `questions_answered_json`
- `chunk_strategy`
- `span_json`
- `authority_guess`
- `review_status`
- `embedding`
- `metadata_version`

#### `ingestion_runs`

- `id`
- `document_id`
- `status`
- `parser_strategy`
- `chunking_strategy`
- `started_at`
- `finished_at`
- `metrics_json`
- `error_json`

#### `ingestion_step_traces`

- `id`
- `ingestion_run_id`
- `node_name`
- `status`
- `input_summary_json`
- `output_summary_json`
- `started_at`
- `finished_at`

#### `review_tasks`

- `id`
- `ingestion_run_id`
- `document_id`
- `scope`
- `scope_ref_id`
- `reason_code`
- `summary`
- `status`
- `resolution_json`

### 15.3 幂等要求

所有写操作必须支持重复执行：

- 以自然键去重
- 或使用 upsert

重点是避免 graph replay 时重复创建 chunk、trace、review task。

---

## 16. 失败恢复策略

### 16.1 节点级失败

单个节点失败时：

- 记录 `error.code / error.message / node`
- 更新 ingestion status
- 支持人工或系统重新 resume

### 16.2 worker 级失败

单个 worker 失败时：

- 不应直接让主图全盘失败
- 聚合节点可将该 worker 标记为 failed result
- 若失败比例超阈值，再升级为 `FAILED` 或 `REVIEW_REQUIRED`

### 16.3 恢复入口

v1 支持：

- 从最后 checkpoint 恢复
- 从 review interrupt 恢复
- 对指定 `ingestionId` 做 rerun

---

## 17. 与现有项目的接入方式

### 17.1 当前项目现状

当前仓库主要是面向安全问卷 demo 的简化 RAG 流程，核心仍是：

- Excel 上传
- question parse
- knowledge retrieval
- answer generation

当前 `lib/rag/retrieval.ts` 与 `lib/rag/generation.ts` 是简单的同步链路，不包含 ingestion graph。

### 17.2 v1 接入原则

不应该直接重写现有问卷处理链路。

更合理的方式是新增一条知识入库主线：

1. 保留现有 demo 问卷回答路径
2. 新增 `knowledge ingestion` 路径
3. 将 `knowledge_chunks` 作为未来 retrieval 的真正底层数据源

### 17.3 建议目录结构

```text
lib/
  ingestion/
    contracts/
      document.ts
      section.ts
      chunk.ts
      review.ts
    graph/
      state.ts
      builder.ts
      nodes/
        receive-request.ts
        classify-document.ts
        extract-structure.ts
        choose-chunk-strategy.ts
        aggregate-chunks.ts
        aggregate-enrichment.ts
        validate-chunks.ts
        review-gate.ts
        persist-chunks.ts
        finalize-report.ts
      subgraphs/
        pdf-parser.ts
        docx-parser.ts
        xlsx-parser.ts
        html-parser.ts
      workers/
        chunk-worker.ts
        enrichment-worker.ts
        validation-worker.ts
    services/
      parsers/
      chunking/
      enrichment/
      validation/
      indexing/
    storage/
      repositories/
    api/
      start-ingestion.ts
      resume-ingestion.ts
```

---

## 18. API 设计建议

### 18.1 `POST /api/knowledge/ingestions`

用途：

- 启动一个 ingestion graph

请求：

```json
{
  "documentId": "doc_123",
  "sourceUri": "/uploads/foo.pdf",
  "mimeType": "application/pdf",
  "originalFilename": "foo.pdf"
}
```

返回：

```json
{
  "ingestionId": "ing_123",
  "status": "RECEIVED"
}
```

### 18.2 `GET /api/knowledge/ingestions/[id]`

用途：

- 查询 graph 当前状态
- 供前端展示运行进度与 review 状态

### 18.3 `POST /api/knowledge/ingestions/[id]/resume`

用途：

- 在 review interrupt 后恢复 graph

请求：

```json
{
  "decision": {
    "action": "approve_chunks",
    "chunkIds": ["chunk_1", "chunk_2"]
  }
}
```

---

## 19. 质量指标

v1 需要记录以下指标：

- Parse success rate
- Avg sections per document
- Avg chunks per document
- Chunk validation pass rate
- Missing-lineage rate
- Review-required rate
- Embedding success rate
- Time to index per document
- Cost per document

---

## 20. 测试策略

### 20.1 单元测试

覆盖：

- contract 校验
- chunk strategy 规则
- validation 规则
- aggregation 逻辑

### 20.2 图级测试

覆盖：

- 正常完整流程
- parser fail
- enrichment fail
- review interrupt
- resume 后继续执行

### 20.3 回归样本

至少准备：

- FAQ 文档
- 合同条款文档
- 白皮书 section 文档
- 问卷类 XLSX
- HTML 产品文档

---

## 21. 实施建议

### 21.1 推荐迭代顺序

第一阶段：

1. 定义 contracts
2. 定义 state
3. 搭 LangGraph 主图骨架
4. 接入 `XLSX` 与 `DOCX` 两类简单子图
5. 跑通 review interrupt

第二阶段：

1. 补 PDF / HTML
2. 补 enrichment worker
3. 补 validation issue taxonomy
4. 接入向量索引

第三阶段：

1. 接 retrieval 消费 `knowledge_chunks`
2. 补 trace 查询与运营面板

### 21.2 重要决策

v1 不建议：

- 先做完整多租户权限
- 先做复杂 agent tool loop
- 先做全自动修复

v1 应优先保证：

- 流程稳定
- contract 稳定
- review 可暂停恢复
- trace 可查询

---

## 22. 最终结论

`Agentic Ingestion Agent` 的 v1 最佳实现方式不是“做一个万能 agent”，而是：

**用 LangGraph 把知识入库流程做成一个 workflow-first、contract-first、可恢复、可人工复核的状态机。**

具体落地上：

- 主图负责状态推进与条件路由
- 子图负责不同文档类型解析
- worker 负责 chunk / enrichment / validation 并行处理
- interrupt 负责 review-required 场景
- Postgres 负责 checkpoint、trace 与知识对象持久化

这条路径既能满足 `Agentic Knowledge` 对工程系统的要求，也不会把 v1 过早做成不可控的自由 agent 系统。
