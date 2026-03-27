# Agentic Ingestion Enterprise Alignment Spec

**日期:** 2026-03-26  
**状态:** Draft  
**作者:** Codex  
**范围:** 将 `Agentic Knowledge` 中的 `Agentic Ingestion Agent` 收口为一版更接近企业级最佳实践的产品与系统规格，覆盖后端入库链路、人工审核、可观测性，以及面向用户的知识录入前端形态。

---

## 1. 文档目标

本文档回答 4 个问题：

1. 企业级 `Agentic Ingestion` 到底应该把哪些环节做成 deterministic workflow，哪些环节做成 LLM decision layer。
2. 当前实现与 `Agentic Knowledge.md` 的目标之间还差什么。
3. 对知识库录入场景，前端应该如何把 agent 执行状态暴露给用户。
4. 下一阶段应该如何把现有 v1 实现升级到更符合企业级标准的形态。

本文档不覆盖 retrieval、answering、learning loop 的完整设计，只聚焦 ingestion。

---

## 2. 设计结论

### 2.1 一句话结论

企业级最佳路线不是“让 LLM 接管入库”，而是：

**deterministic pipeline 做主干，LLM 只负责少数高价值判断点，LangGraph 负责状态机、暂停恢复和可审计执行。**

### 2.2 v1.1 推荐原则

1. `workflow-first`
   主链路必须是显式状态机，而不是一串隐式函数调用。

2. `contract-first`
   每个节点之间都传递结构化对象，不传递自由文本协议。

3. `selective-LLM`
   LLM 只出现在文档分类、chunk strategy 决策、metadata enrichment、review routing 这类高价值判断点。

4. `human-in-the-loop`
   高风险内容必须显式进入人工审核，而不是悄悄降级或直接忽略。

5. `artifact-first`
   入库结果的核心对象是 `Document / Section / Chunk / ReviewTask / Trace`，不是聊天记录。

6. `replayable-by-design`
   失败恢复、人工 resume、审计、质量分析，都必须建立在 durable state 之上。

### 2.3 实施纪律

本 spec 对后续实现是**绑定性的 backend spec**，不是“方向参考稿”。

执行约束如下：

1. 不允许未经明确记录就把 spec 中的关键设计“简化实现”。
2. 如果实现时发现 spec 有重大缺口、重大风险、重大成本问题，必须先升级回 spec 层讨论，再决定是否调整，不允许在代码里静默改语义。
3. plan 必须逐条映射 spec 的核心对象、状态机、side-effect 边界与异常语义。
4. code review 必须以“是否符合 spec contract”为第一标准，而不是“是否大致能跑”。
5. 后续如需偏离本 spec，必须显式记录：
   - 偏离原因
   - 影响范围
   - 临时方案还是正式改动
   - 是否需要回写 spec

本条的目标很明确：

**不允许再出现“spec 一套，代码一套”的静默偏移。**

---

## 3. 外部最佳实践对齐

### 3.1 LangGraph 对齐结论

LangGraph 官方区分 `workflow` 与 `agent`。对 ingestion 这类长流程、可暂停、可恢复的系统，最佳用法是：

- 用 `StateGraph` 表达状态机
- 用 `conditional edges` 表达条件路由
- 用 `interrupt` + `Command(resume)` 表达人机协作
- 用 persistence / durable execution 支撑恢复、回放与断点续跑

这与本系统的需求高度一致：文档处理是一个多步骤、有 side effects、有人工介入点的工作流，而不是一次性聊天。

参考：

- LangGraph Workflows and Agents: https://docs.langchain.com/oss/python/langgraph/workflows-agents
- LangGraph Durable Execution: https://docs.langchain.com/oss/javascript/langgraph/durable-execution
- LangGraph Interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts

### 3.2 Azure RAG guidance 对齐结论

Azure 对 chunking 和 enrichment 的公开 guidance 有两个关键点：

1. chunking 不能一刀切，应该结合文档结构和内容类型选策略。
2. chunk 不应只是文本和 embedding，还应包含 title、summary、keywords、entities 等 enrichment 字段。

这意味着我们的 `Chunk` 不能只是 text blob，而应该是带 lineage、review、metadata 的 knowledge object。

参考：

- Azure RAG Chunking Phase: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-chunking-phase
- Azure RAG Enrichment Phase: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-enrichment-phase

### 3.3 Responsive 公开产品形态对齐结论

Responsive 公开资料展示出的不是“把 chain-of-thought 直接暴露给用户”，而是：

- `import agent` 负责 ingest and organize complex assessments/documents
- 自动识别 tables、dropdowns、subsections 等结构元素
- 知识管理强调 AI-powered governance、trusted knowledge hub、content health

这说明企业级产品形态更像：

**上传文件 -> 后台异步处理 -> 前端展示任务状态、治理状态和可复核结果**

而不是一个普通聊天窗口。

参考：

- Responsive AI product page: https://www.responsive.io/product/ai
- Responsive knowledge management: https://www.responsive.io/capability/knowledge-management

---

## 4. 系统边界

`Agentic Ingestion Agent` 的职责是：

1. 接收原始文件或文档 URI。
2. 识别文档类型与处理策略。
3. 提取结构化对象。
4. 生成可治理的 chunk-level knowledge objects。
5. 完成 enrichment、validation、review routing。
6. 落库并写入索引。
7. 暴露可观测状态给前端和运维系统。

它不负责：

- 直接回答最终用户问题
- 复杂检索规划
- 最终回答生成
- 自动学习闭环修复

---

## 5. 核心对象模型

### 5.1 基础对象

- `Document`
- `Section`
- `Chunk`
- `ReviewTask`
- `IngestionRun`
- `StepTrace`

### 5.2 Chunk 定义

`Chunk` 是 knowledge object，而不是纯文本切片。最低要求包含：

- `rawTextRef`
- `cleanText`
- `contextualText`
- `title`
- `summary`
- `keywords`
- `entities`
- `questionsAnswered`
- `chunkStrategy`
- `source span`
- `document lineage`
- `reviewStatus`
- `metadataVersion`
- `embedding`

但如果目标是企业级 ingestion，真正的 backend 最低 schema 不应止于此。`Chunk` 最低治理字段应补齐为：

- `chunkId`
- `documentId`
- `sectionId`
- `tenant`
- `rawTextRef`
- `cleanText`
- `contextualText`
- `title`
- `summary`
- `keywords`
- `entities`
- `questionsAnswered`
- `chunkStrategy`
- `sourceSpan`
- `reviewStatus`
- `indexStatus`
- `metadataVersion`
- `checksum` 或 `contentHash`
- `effectiveDate`
- `version`
- `authorityLevel`
- `aclTags`
- `embedding`

### 5.2.1 Chunk 治理字段说明

- `authorityLevel`
  用于区分政策、合同、FAQ、临时说明等知识权威性层级。

- `effectiveDate / version`
  用于处理版本冲突、过期内容与 stale-sensitive retrieval。

- `aclTags`
  用于后续权限过滤，不要求 v1.1 立即实现完整 ACL，但 schema 必须预留。

- `indexStatus`
  用于区分：
  - `pending`
  - `indexed`
  - `rejected`
  - `stale`
  - `reindex_required`

- `checksum/contentHash`
  用于幂等写入、重复检测、局部重算和 before/after 对比。

### 5.3 ReviewTask 定义

`ReviewTask` 必须支持：

- `pending`
- `resolved`
- `resolutionJson`

这样人工审核既可回放，也可审计。

但企业级 `ReviewTask` 最低 contract 还必须包括：

- `reviewTaskId`
- `taskType`
- `reasonCodes`
- `targetDocumentId`
- `targetChunkIds`
- `assignee`
- `owner`
- `status`
- `resolutionType`
- `resolutionJson`
- `createdAt`
- `resolvedAt`

### 5.3.1 ReviewTask 语义

- `taskType`
  至少支持：
  - `document_review`
  - `chunk_review`
  - `metadata_review`
  - `strategy_review`

- `reasonCodes`
  支持一个 task 对应多个风险原因，而不是只存单个 reason。

- `resolutionType`
  至少支持：
  - `approved`
  - `rejected`
  - `partially_approved`
  - `metadata_edited`
  - `escalated`

- `targetChunkIds`
  必须允许一个 review task 作用于多个 chunk，而不是默认一 task 对一 chunk。

---

## 6. 企业级分层原则

### 6.1 Deterministic Execution Layer

以下环节必须保持 deterministic：

1. 文件读取和格式校验
2. parser 执行
3. 结构标准化
4. chunk 执行
5. schema 校验
6. 数据库存储
7. 向量索引写入
8. trace 持久化

原因：

- 幂等性和一致性要求高
- 失败恢复必须可预测
- 重跑结果不能随提示词漂移
- 人工审核点必须稳定复现

### 6.2 LLM Decision Layer

以下环节适合用 LLM 或有限 agent 决策：

1. `Document Router`
   输出：`docType / parserStrategy / initialChunkingHypothesis / priorityFeatures`

2. `Chunk Strategy Agent`
   输出：`section / faq / clause / row`

3. `Metadata Enrichment Agent`
   输出：`title / summary / keywords / entities / questionsAnswered / versionGuess / authorityGuess / reviewHints`

4. `Review Routing Agent`
   输出：是否进入人工审核、建议动作、风险摘要

### 6.3 Human Review Layer

人工不应参与所有文件，只在高风险边界介入：

- prompt injection 风险
- source anchor 缺失
- chunk 过碎或过长
- 版本冲突
- 高不确定度策略选择
- 关键政策文档的高风险 metadata 修改

---

## 7. 状态语义

### 7.1 Run 状态

`IngestionRun` 至少支持：

- `RECEIVED`
- `CLASSIFIED`
- `PARSED`
- `CHUNKED`
- `ENRICHED`
- `VALIDATED`
- `REVIEW_REQUIRED`
- `INDEXING`
- `INDEXED`
- `PARTIALLY_INDEXED`
- `REJECTED`
- `FAILED`

### 7.2 为什么需要 `PARTIALLY_INDEXED`

真实企业文档经常会出现：

- 一个文档中多数 chunk 可通过
- 少量 chunk 被 reject
- 或部分 chunk 因 review / validation 不通过而不进入索引

这时 run 不能简单记成 `INDEXED` 或 `REJECTED`，而应记为 `PARTIALLY_INDEXED`。

### 7.3 Chunk 状态

`Chunk.reviewStatus` 至少支持：

- `pending`
- `approved`
- `review_required`
- `rejected`

`Chunk.indexStatus` 至少支持：

- `pending`
- `indexed`
- `rejected`
- `stale`
- `reindex_required`

### 7.4 状态收口规则

- 所有 chunk 均 `approved + indexed` -> `INDEXED`
- 部分 chunk `indexed`、部分 `rejected` -> `PARTIALLY_INDEXED`
- 文档级 reject -> `REJECTED`
- 任一关键节点不可恢复错误 -> `FAILED`

---

## 8. 总体架构

采用三层架构：

1. `API / Trigger Layer`
   接收上传请求、启动图执行、查询状态、提交人工审核决策。

2. `LangGraph Orchestration Layer`
   负责状态机、路由、并行 worker、interrupt/resume、checkpoint、trace。

3. `Execution Services Layer`
   负责 parser、structure normalization、chunk execution、enrichment、validation、repository 持久化。

关键原则：

- graph 决定下一步做什么
- service 决定这一步怎么做

---

## 9. 理想主图

### 8.1 主图节点

```text
START
  -> receive_ingestion_request
  -> load_source_descriptor
  -> classify_document
  -> run_parser_subgraph
  -> normalize_structure
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

### 8.2 状态机

```text
RECEIVED
-> CLASSIFIED
-> PARSED
-> CHUNKED
-> ENRICHED
-> VALIDATED
-> INDEXING
-> INDEXED | PARTIALLY_INDEXED
```

异常分支：

- `PARSE_FAILED`
- `ENRICH_FAILED`
- `REVIEW_REQUIRED`
- `REJECTED`
- `FAILED`

### 8.3 子图原则

每种输入格式一个 parser subgraph：

- `pdf`
- `docx`
- `xlsx`
- `html`

每个子图输出统一 contract：

- `document`
- `sections`

---

## 10. 结构驱动的 Chunk Strategy

这是当前最重要的规格修正点。

### 9.1 设计结论

`chunkingStrategy` 不能仅由文件类型直接决定。

正确路径应该是：

`doc router 给初始猜测 -> structure extraction 输出结构树 -> chunk strategy agent 根据结构和内容最终决策`

### 9.2 输入信号

`Chunk Strategy Agent` 的输入至少包括：

- `docType`
- `parserStrategy`
- `priorityFeatures`
- `section kind distribution`
- `heading density`
- `faq pair density`
- `clause pattern density`
- `row/table density`
- `source preview snippets`

### 9.3 输出

输出必须是有限枚举：

- `section`
- `faq`
- `clause`
- `row`

并带：

- `confidence`
- `reason`
- `fallbackStrategy`

### 9.4 决策规则

最低规则如下：

- FAQ 内容明显呈现问答对：`faq`
- 合同/法律/条款型文档且 clause pattern 明显：`clause`
- 表格/问卷/行记录密集：`row`
- 普通政策/白皮书/一般产品文档：`section`

### 9.5 低置信度策略

当置信度低时，必须走保守默认：

- `docx/html/pdf -> section`
- `xlsx -> row`

并在 trace 中记录低置信度事件，必要时生成 `review task`

---

## 11. 结构抽取规格

### 10.1 目标

parser 不只是抽出纯文本，还要尽可能产出结构树。

### 10.2 v1.1 最低结构要求

应支持这些 `Section.kind`：

- `heading`
- `paragraph_block`
- `table`
- `faq_block`
- `clause_block`
- `row_block`

### 10.3 格式差异

- `DOCX`
  优先识别 heading、paragraph、table、faq、clause
- `PDF`
  优先识别 page、paragraph、heading、table、clause
- `HTML`
  优先识别 heading、paragraph、list、table、faq-like DOM blocks
- `XLSX`
  优先识别 sheet、row、header structure

### 10.4 设计判断

不是每种格式都必须在 v1.1 达到同样强度。

建议分级：

- `xlsx row_block`：高确定性
- `docx heading/paragraph`：中高确定性
- `html dom structure`：中确定性
- `pdf complex layout`：最低确定性，保守处理

---

## 12. Metadata Enrichment 规格

### 11.1 目标

把 `Chunk` 从“可存储文本块”升级成“可检索、可治理、可解释对象”。

### 11.2 最低字段

- `title`
- `summary`
- `keywords`
- `entities`
- `questionsAnswered`
- `versionGuess`
- `authorityGuess`
- `reviewHints`

### 11.3 执行原则

- 输出必须是结构化 JSON
- enrichment 必须可重跑
- enrichment 失败不应破坏原始 chunk
- 高成本字段可分层启用

### 11.4 v1.1 推荐分层

第一层必须做：

- `title`
- `summary`

第二层推荐做：

- `keywords`
- `entities`
- `questionsAnswered`

第三层可选：

- `versionGuess`
- `authorityGuess`
- `reviewHints`

---

## 13. Validation 与 Review Routing

### 12.1 Validation 必须覆盖

- chunk 为空
- source span 缺失
- lineage 缺失
- chunk 过碎
- chunk 过长
- prompt injection 风险
- metadata 质量异常

### 12.1.1 Validation 结果分级

validation 不能只有“过/不过”，必须分成：

- `hard_fail`
  必须阻断索引写入，不能自动通过。

- `soft_warning`
  允许继续，但必须进入 review routing 或在 trace 中记录 warning。

最低建议：

- `prompt injection` -> `hard_fail` 或 `review_required`
- `missing source span` -> `hard_fail`
- `chunk 过长/过碎` -> `soft_warning`
- `metadata 质量低` -> `soft_warning`

### 12.2 Review Routing 必须区分

- 自动通过
- 进入人工审核
- 直接拒绝

### 12.3 review gate 交互

前端或 API 可提交：

- `approve_document`
- `reject_document`
- `approve_chunks`
- `reject_chunks`
- `edit_chunk_metadata`

这部分当前实现方向是正确的，后续重点是把 `review routing` 做成更明确的 decision layer，而不只是 validation 规则后置产物。

### 12.4 `edit_chunk_metadata` 的后效

这是必须在 spec 层写透的点，不能留给实现时自由发挥。

当用户执行 `edit_chunk_metadata` 时，系统必须：

1. 生成新的 `metadataVersion`
2. 记录 before/after diff
3. 更新 `resolutionJson`
4. 对修改后的 chunk 重新执行最小必要 validation
5. 判断是否需要重新 embedding
6. 如涉及检索相关字段变化，则把 `indexStatus` 置为 `reindex_required`

### 12.5 re-embedding 规则

以下字段变化必须触发重新 embedding：

- `cleanText`
- `contextualText`
- `summary`
- 任何实际参与 embedding text 拼装的字段

以下字段变化通常不要求重新 embedding：

- `authorityLevel`
- `aclTags`
- `effectiveDate`
- 纯治理字段

### 12.6 审核结果与运行结果的关系

- 文档级通过：后续正常入索引
- 文档级拒绝：run -> `REJECTED`
- chunk 级部分通过：run 最终可为 `PARTIALLY_INDEXED`
- metadata 编辑后待重建索引：run 先进入 `INDEXING`，重建完成后再收口

---

## 14. 持久化模型

### 13.1 必要表

- `documents`
- `document_sections`
- `knowledge_chunks`
- `ingestion_runs`
- `ingestion_step_traces`
- `review_tasks`

### 13.2 持久化原则

1. `documents` 是文件级主对象
2. `document_sections` 是结构化中间层
3. `knowledge_chunks` 是检索和治理的核心对象
4. `ingestion_runs` 记录一次执行
5. `ingestion_step_traces` 记录节点级可观测事件
6. `review_tasks` 记录人工审核待办和决议

### 13.3 Side-effect 边界

必须把以下 side effects 单独隔离：

- upsert 文档
- upsert sections
- replace/upsert chunks
- write embeddings
- resolve review tasks
- write final run result

这样 durable execution 恢复时更容易保持幂等。

### 13.4 Draft / Final 双阶段持久化

企业级实现不应只有单次 `persist_chunks`。

推荐拆成两个层次：

1. `draft persistence`
   在 validation/review 之后先落可审核对象，保证：
   - 人工审核有稳定对象可看
   - review 前状态可回放
   - 失败后可恢复

2. `final publish`
   在 review 决议完成后，再把通过的 chunk 标记为可索引并写入向量字段。

### 13.5 v1.1 最低落地方式

如果暂时不拆物理表，也必须在同一张表里表达两阶段语义：

- `reviewStatus`
- `indexStatus`
- `metadataVersion`
- `resolutionJson`

也就是说，review 前对象不能是“纯内存态”，必须可恢复、可审计。

---

## 15. 当前实现对齐评估

### 15.1 已经对齐的部分

1. 主图已经是 LangGraph state machine
2. 支持 `interrupt / resume`
3. 支持 `trace / run / review task` 持久化
4. 支持真实 `DOCX -> parse -> chunk -> validate -> persist -> embedding -> index`
5. parser 已拆成独立 subgraph
6. storage/repository 层已独立

### 15.2 仍未完全对齐的部分

1. `Document Router` 过于依赖 `mimeType + filename`
2. `Chunk Strategy Agent` 还不是真正的 decision layer
3. `Structure Extraction` 对 `faq_block / clause_block / feature/workflow block` 识别不足
4. `Metadata Enrichment` 目前只做到 `title/summary`
5. `Review Routing` 还主要由规则触发，缺少结构化 decision signal
6. 前端还没有正式的 ingestion run console

### 15.3 当前最重要缺口

最关键的规格缺口只有一个：

**文档结构还没有真正影响最终 chunk strategy 选择。**

---

## 16. v1.1 升级路线

### Phase A: 结构驱动的策略选择

- 强化 parser 输出的结构语义
- 新增 `Chunk Strategy Agent`
- 让 `choose_chunk_strategy` 真正根据结构决策

### Phase B: 完整 enrichment

- 扩展到 `keywords/entities/questionsAnswered`
- 把高成本字段做成可配置层级

### Phase C: review routing 升级

- 引入结构化 LLM routing
- 低置信度触发 review

### Phase D: 前端控制台

此项先不纳入当前 backend 实施范围。

当前阶段只要求：

- 后端状态语义完整
- review / indexing / partial indexing 可表达
- 未来前端可直接消费的事件与对象 contract 已稳定

---

## 17. 实施约束

1. 不让 parser 执行本身依赖 LLM
2. 不让 chunk 执行本身依赖 LLM
3. 不把数据库一致性交给模型决定
4. 当前阶段不实现前端，不允许为了前端方便弱化 backend contract
5. 不把 `knowledge_chunks` 退化成只有 text + embedding 的简化模型
6. 不允许以“先跑通”为理由去掉治理字段、partial status、review 后效、draft/final 语义
7. 任何实现如果需要裁掉以上能力，必须先回到 spec 层征求用户确认

---

## 18. 结论

本系统的企业级正确方向应明确为：

**LangGraph 管流程，deterministic services 管执行，LLM 只做有限决策，人工审核管理高风险边界，前端展示的是任务状态和知识对象，而不是模型的思维过程。**

这条路线与 `Agentic Knowledge.md` 的精神一致，也与当前公开企业级实践更接近。

下一阶段最值钱的工作不是继续扩 parser 数量，而是把：

1. `结构驱动 chunk strategy`
2. `更完整的 enrichment`
3. `review routing decision layer`
4. `更厚的对象 contract 与状态语义`

这 4 个点做实。
