# Agentic Ingestion Backend Retro

Date: 2026-03-27
Branch: `feat-agentic-ingestion-langgraph-v1`
Latest commit at retro time: `2b48cc2`

## 1. 当前系统定位

这套后端目前不是“纯 agent 系统”，而是：

- `workflow-first` 的 agentic ingestion workflow
- LangGraph 负责 `state / routing / batching / interrupt / resume / tracing`
- LLM 只放在少数高价值 decision layer

当前主干链路是：

`load_source_descriptor -> resolve_parser_strategy -> parse -> classify_document -> choose_chunk_strategy -> build_chunk_tasks -> aggregate_chunks -> validate -> review_gate -> persist_chunks -> write_vector_index -> finalize_report`

其中：

- deterministic 为主：
  - source descriptor
  - parser routing
  - parser execution
  - section normalization
  - chunk building
  - validation hard rules
  - persistence / indexing
- LLM decision 为辅：
  - `classify_document`
  - `choose_chunk_strategy`
  - `enrich_chunk`
  - `review routing`

## 2. 前半段已经做完的事情

### 2.1 基础对象和持久化骨架

- 建立了 ingestion 核心 contract：
  - `Document`
  - `Section`
  - `Chunk`
  - `ReviewTask`
  - `IngestionRun`
  - `StepTrace`
- 增补了企业级治理字段：
  - chunk governance fields
  - review lifecycle fields
  - partial indexing status
- repository/storage 层已落库骨架，不再只是占位。

### 2.2 parser 与结构抽取

- 支持 parser：
  - `pdf`
  - `docx`
  - `html`
  - `xlsx`
- parser routing 已改成 deterministic，不再让 LLM 决定 parser。
- `pdf` 解析接入了 PyMuPDF 辅助链路，解决了 handbook 型 PDF 被误切 FAQ 的问题。
- 增加了 `source descriptor` 预览文本抽取，供后续分类和决策使用。

### 2.3 graph 主干重排

- 主图顺序从：
  - `load_source_descriptor -> classify_document -> parse -> choose_chunk_strategy`
- 改成：
  - `load_source_descriptor -> resolve_parser_strategy -> parse -> classify_document -> choose_chunk_strategy`

这件事很关键，因为：

- parser 不该是 LLM 决策
- 文档分类应该基于 parse 后的结构信号，而不是只看 mime/file name

### 2.4 chunk strategy 前半段治理

- 目前已支持 chunk strategy：
  - `section`
  - `faq`
  - `clause`
  - `row`
- `docType` 与 `initialChunkingHypothesis` 已解耦。
  - 例如：
    - 表格载体但语义是合同：`docType=contract`，仍然可以 `initialChunkingHypothesis=row`
- `choose_chunk_strategy` 增强了输入 contract，不再只给几个弱字段。

### 2.5 row-heavy 性能问题

`enrich` 之前最关键的一轮性能治理已经做了：

- row-heavy 文档不再全量塞进 graph state
- xlsx parser 支持 sampling / batch planning
- row strategy 的 chunk 构造改成 bounded batch
- full ingestion 的 persist / embedding / publish 改成 batch 化
- 提高 recursion limit，避免 row-heavy ingestion 在 LangGraph 里提前爆掉

### 2.6 review / partial indexing / trace

- review gate 已支持 interrupt / resume
- run status 支持 `PARTIALLY_INDEXED`
- trace 已落 `StepTrace`
- metadata edit 后的 reindex contract 已补上

### 2.7 测试体系

现在不是只靠手工 smoke 了，而是三层测试都在：

- 单元/契约测试
- graph flow / batch / review / persistence 测试
- 真实语料回归测试

已接入 8 个真实样本回归：

- HR Manual DOCX
- HR Manual HTML
- HR Manual PDF
- VTEX category XLSX
- VTEX checklist XLSX
- CUAD label-report XLSX
- CUAD collaboration contract PDF
- CUAD promotion contract PDF

并且有两套回归入口：

- 离线 corpus regression
- live GPT corpus regression

## 3. 前半段最重要的经验

### 3.1 parserStrategy 不能交给 LLM

这是前半段最重要的结构性修正。

如果 parser 也交给 LLM：

- 不稳定
- 不可解释
- 复现困难
- 容易被 mime / 文件名误导

结论：

- parser routing 必须 deterministic

### 3.2 docType 判断必须后移到 parse 之后

只看：

- mime type
- filename
- preview text

是不够的。

真正有价值的是 parse 后的结构信号：

- `sectionKindCounts`
- heading density
- faq density
- clause density
- row/table density
- sampled blocks

### 3.3 docType 和 chunking 不是一回事

这是另一个关键经验。

错误心智是：

- `contract -> clause`
- `xlsx -> questionnaire -> row`

正确心智是：

- `docType` 表示语义类别
- `chunk strategy` 表示最合适的知识单元边界

例如：

- 合同语义的 xlsx label report：
  - `docType=contract`
  - `chunking=row`

### 3.4 prompt 不能只给字段名和枚举值

这是这轮最大的 prompt 教训。

错误做法：

- 只写 `docType: faq|policy|contract|questionnaire|product_doc`
- 只写 `chunkingStrategy: section|faq|clause|row`

这样模型只能靠单词猜。

正确做法：

- 明确写每个类别的定义
- 明确 tie-break 规则
- 明确哪些信号优先于哪些信号
- 给真实的结构摘要和样本片段

### 3.5 真实语料回归比 synthetic test 更重要

如果没有真实样本回归，前半段这些问题根本暴露不出来：

- handbook PDF 被误成 FAQ
- contract PDF 被误成 policy
- contract-like xlsx 被误成 questionnaire/policy

结论：

- 真实 corpus regression 是第一等公民，不是补充项

### 3.6 row-heavy 文档必须按生产设计来做

测试慢不是测试问题，本质是生产设计问题。

如果生产上：

- 一次性把 13 万行都塞进 state
- 一次性 build 全量 chunk task
- 一次性做 embedding / persist / publish

那架构就错了。

结论：

- batch / streaming / skip policy 必须从设计上进入主链路

## 4. enrich 之后还要做什么

目前前半段大体收住了。下一阶段重点就是 `enrich` 之后。

### 4.1 enrich prompt 与 contract

还没彻底做严的部分：

- 明确每个 enrich 字段到底怎么定义
- 不同 chunk type 的 enrich 目标不同
- prompt 不能继续只是字段名罗列

当前默认思路应收敛到 `L2`：

- `title`
- `summary`
- `keywords`
- `questionsAnswered`

可选字段：

- `questionVariants`
- `entities`
- `authorityLevel`
- `reviewHints`
- `versionGuess`

### 4.2 enrich 不是所有 chunk 都要跑

必须设计 skip policy。

该跳过的典型 chunk：

- 极短 chunk
- 纯标题 chunk
- boilerplate chunk
- header-only row
- 低信息密度 row
- 已知低价值重复块

否则：

- 太慢
- 太贵
- metadata 噪音高

### 4.3 enrich 必须分 chunk type

不同 chunk type 不该用一套 enrich 成本模型。

建议：

- `section`
  - title
  - summary
  - keywords
- `faq`
  - canonical question
  - question variants
  - short answer summary
  - questionsAnswered
- `clause`
  - clause title
  - obligation / restriction / exception / risk
  - summary
- `row`
  - 优先 rule-based
  - 仅高价值 row 才上 LLM

### 4.4 enrich 并发 / batching / cache

这块是下阶段的 P0。

必须做：

- bounded concurrency
- batch scheduling
- retry / timeout policy
- prompt cache / content-hash cache
- duplicate enrich skip

否则真实入库速度会非常差。

### 4.5 enrich mode / level

应该正式把模式定下来：

- `L0`
  - no enrich
- `L1`
  - title + summary
- `L2`
  - title + summary + keywords + questionsAnswered
- `L3`
  - review/risk oriented enrich

同时区分执行模式：

- `strategy_check`
- `full_ingestion`

### 4.6 enrich 后 validation / review

还要补清楚：

- enrichment 输出的 schema validation
- invalid metadata 的 hard fail / soft warning
- 哪些 metadata 问题进入 review queue
- metadata edit 后是否局部 re-enrich / re-embed / reindex

### 4.7 enrich 测试

下阶段必须补的测试：

- per-field contract tests
- skip policy tests
- bounded concurrency tests
- cost guard tests
- per-chunk-type enrichment tests
- live enrich regression on real corpus

## 5. enrich 阶段的注意事项

### 5.1 不要把 enrich 当成同步硬前置

`strategy_check` 不该跑 enrich。

调结构问题时必须有 fast path。

### 5.2 不要把所有字段都交给一个大 prompt

更稳的做法是：

- contract 清楚
- 字段最小化
- 逐层加字段

### 5.3 不要为了“更智能”牺牲吞吐和可复现性

enrich 是增强层，不是核心解析层。

主链路仍然要以：

- 可 replay
- 可 trace
- 可批处理
- 可降级

为先。

### 5.4 继续坚持真实语料驱动

enrich 阶段如果只在 synthetic 文本上调 prompt，会再次走偏。

必须用真实 corpus 做：

- FAQ
- policy
- clause
- row

四类回归。

## 6. 我们如何加快 agent 开发效率

可以，superpower 里本来就有几类工具能直接帮助这套开发节奏。

### 6.1 这几个最有用

- `writing-plans`
  - 每次进入一个新阶段前，先把 plan 写死，避免“说一套做一套”
- `test-driven-development`
  - 先写失败测试，再补实现
- `verification-before-completion`
  - 完成前必须跑验证，避免口头宣称“应该可以”
- `using-git-worktrees`
  - 大阶段独立 worktree，避免主工作区互相污染
- `requesting-code-review`
  - 每个里程碑让另一个视角审一遍
- `retro`
  - 定期复盘本周 ship 了什么、哪些问题反复出现

### 6.2 当前项目建议固定节奏

建议后面每个阶段都固定这套节奏：

1. `spec` 对齐
2. `plan` 写死
3. TDD 写第一批失败测试
4. 实现
5. 离线回归
6. 真实 live 回归
7. 复盘更新

### 6.3 可以进一步提效的地方

- 维护固定真实语料集，而不是每次临时找文件
- 把 live regression 做成标准命令
- 每个 decision point 都拆出 prompt builder 纯函数，方便直接测 prompt 语义
- 所有大变更都要求 corpus regression 不回退

## 7. 定期复盘建议

建议以后每个阶段都维护一篇 retro，至少更新这几个部分：

- 这阶段做了什么
- 暴露了哪些真问题
- 哪些是结构性修正
- 哪些是 prompt 教训
- 哪些测试补进去了
- 下一阶段的 P0 / P1

推荐目录：

- `docs/superpowers/retros/`

推荐命名：

- `YYYY-MM-DD-<topic>-retro.md`

## 8. 下一阶段建议执行顺序

### P0

- 定 `enrich` 字段 contract
- 定 `enrich level`
- 定 `skip policy`
- 定 `per chunk type` enrich 策略

### P1

- 做 bounded concurrency
- 做 enrich cache
- 做 rule-based row enrich fast path
- 做 enrich validation / review routing

### P2

- 接入真实 enrich live regression
- 做成本/吞吐指标
- 做 partial enrich / resume / retry 策略

## 9. 当前结论

目前前半段可以认为已经进入“能稳定迭代 enrich 阶段”的状态。

真正重要的不是“已经有 graph 了”，而是前半段几个基础问题已经收住：

- parser deterministic
- classify after parse
- docType / chunkStrategy 解耦
- prompt 定义化而不是枚举猜词
- 真实语料回归进入测试
- row-heavy 架构从设计上改成 batch 模式

这意味着下一阶段终于可以把注意力集中到 `enrich` 本身，而不是继续被前半段误判拖着返工。
