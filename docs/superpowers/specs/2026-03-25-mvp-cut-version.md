# Security Questionnaire Demo - MVP Cut Version

**Date:** 2026-03-25
**Status:** MVP Scope
**Purpose:** 快速验证核心价值，2周内可演示

---

## 核心目标

**验证这一件事：用户上传安全问卷，系统能自动生成带引用的草稿答案。**

不是验证"完整系统"，是验证"这个方向有没有价值"。

---

## MVP 必须做（7 天内）

### 1. 单文件上传
- **只支持 Excel**（.xlsx）
- 文件大小 < 5MB
- 存储：本地文件系统（不用 Vercel Blob）
- 上传后立即处理，不做后台队列

### 2. 问题抽取
- **规则优先，LLM 辅助**
- 支持预览前 20 行 + 用户选择问题列
- 自动过滤编号、标题、空行等非问题行
- 不做复杂表格识别
- 不做 PDF/Word（首版不支持）

### 3. 知识库（预置数据）
- **不做导入功能**
- 手写 10-15 条标准答案
- 直接写在代码里或 seed.sql
- 包含：等保、信创、SSO、加密、备份等常见问题

### 4. 检索
- pgvector 语义检索（top 5）
- 轻量关键词重排（category + 关键词命中优先）
- 返回 top 3 候选答案
- 不做复杂混合检索

### 5. 答案生成
- LLM 生成草稿
- **必须带引用**（显示来源答案）
- 不做置信度评分（只标记"需人工确认"）

### 6. 展示界面
- 单页面：问题列表 + 答案详情
- 左边问题，右边答案 + 参考依据
- 可以手工编辑答案
- 支持复制单个答案或全部结果
- 不做完整导出功能（推到第二版）

---

## MVP 不做（推到第二版）

❌ Word/PDF 支持
❌ 知识库管理页
❌ 历史项目列表
❌ SSE 实时进度
❌ 导出功能
❌ 置信度评分
❌ 问题分类
❌ Vercel 部署（先本地跑）
❌ Mastra workflow（太重，直接写函数）
❌ 复杂错误处理

---

## 技术栈（最简化）

```
Frontend: Next.js 15 + shadcn/ui
Backend: Next.js API Routes
Database: PostgreSQL + pgvector
LLM: Vercel AI SDK + 自定义端点
文档解析: xlsx（只支持 Excel）
```

**不用 Mastra**（首版太重，直接写函数调用链）

---

## 数据结构（最简化）

### Projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name TEXT,
  file_path TEXT,
  status TEXT, -- 'processing' | 'ready'
  created_at TIMESTAMP
);
```

### Questions
```sql
CREATE TABLE questions (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  text TEXT,
  order_num INTEGER,
  created_at TIMESTAMP
);
```

### Answers
```sql
CREATE TABLE answers (
  id UUID PRIMARY KEY,
  question_id UUID REFERENCES questions(id),
  content TEXT,
  edited_content TEXT,
  created_at TIMESTAMP
);
```

### AnswerSources (引用)
```sql
CREATE TABLE answer_sources (
  id UUID PRIMARY KEY,
  answer_id UUID REFERENCES answers(id),
  kb_entry_id UUID,
  source_text TEXT,
  created_at TIMESTAMP
);
```

### KnowledgeBase (预置数据)
```sql
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY,
  question TEXT,
  answer TEXT,
  category TEXT,
  document_source TEXT,
  embedding VECTOR(1536),
  created_at TIMESTAMP
);
```

---

## 核心流程（不用 Mastra）

```typescript
// app/api/process/route.ts
export async function POST(req: Request) {
  const { projectId, filePath } = await req.json();

  // 1. 解析 Excel
  const questions = await parseExcel(filePath);

  // 2. 存入数据库
  await saveQuestions(projectId, questions);

  // 3. 对每个问题：检索 + 生成
  for (const question of questions) {
    // 3.1 生成 embedding
    const embedding = await generateEmbedding(question.text);

    // 3.2 向量检索
    const candidates = await vectorSearch(embedding);

    // 3.3 生成答案
    const answer = await generateAnswer(question.text, candidates);

    // 3.4 存储答案和引用
    await saveAnswer(question.id, answer, candidates);
  }

  // 4. 更新项目状态
  await updateProjectStatus(projectId, 'ready');

  return Response.json({ success: true });
}
```

**就这么简单，不要 workflow engine。**

---

## 问题抽取（规则优先 + 预览选列）

```typescript
// 1. 预览接口
async function previewExcel(filePath: string) {
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const sheet = workbook.Sheets[sheetNames[0]];
  const preview = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 20);

  return { sheetNames, preview };
}

// 2. 解析接口（用户选择列后）
async function parseExcel(filePath: string, sheetIndex: number, columnIndex: number) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[sheetIndex]];
  const data = XLSX.utils.sheet_to_json(sheet);

  return data.map((row: any, index) => {
    const text = Object.values(row)[columnIndex] as string;
    return { text, order: index + 1 };
  }).filter(q =>
    q.text &&
    q.text.length > 5 &&
    !isNonQuestion(q.text) // 过滤编号、标题等
  );
}

function isNonQuestion(text: string): boolean {
  // 过滤纯编号、章节标题、是/否等
  return /^[\d\.]+$/.test(text) ||
         /^第[一二三四五六七八九十\d]+[章节条]/.test(text) ||
         /^(是|否|N\/A|Yes|No)$/i.test(text);
}
```

**用户先预览，再选择问题列，避免解析失败。**

---

## 知识库（预置数据 - 统一公司画像）

**假想公司：云图科技（CloudMap Tech）**
- 企业协作 SaaS 平台
- 已运营 3 年，服务 200+ 企业客户
- 部署在国内自建 IDC

```typescript
// lib/seed-data.ts
export const seedKnowledge = [
  {
    question: "是否支持 SSO 单点登录？",
    answer: "支持基于 SAML 2.0 和 OIDC 的单点登录，可与企业统一身份平台集成。具体配置方式请联系技术支持团队。",
    category: "security",
    documentSource: "产品安全白皮书 v3.2"
  },
  {
    question: "数据是否加密存储？",
    answer: "所有数据采用 AES-256 加密存储，密钥由 KMS 管理。传输过程使用 TLS 1.3。详细加密架构可提供技术文档。",
    category: "security",
    documentSource: "数据安全说明文档"
  },
  {
    question: "是否通过等保三级认证？",
    answer: "已通过等保三级测评，详细证书信息可在线下提供，需人工确认最新有效期。",
    category: "compliance",
    documentSource: "等保测评报告"
  },
  {
    question: "是否支持信创环境部署？",
    answer: "支持麒麟操作系统、达梦数据库等信创环境，已完成基础适配。具体兼容性清单请联系售前团队确认。",
    category: "compliance",
    documentSource: "信创适配说明"
  },
  {
    question: "数据备份策略是什么？",
    answer: "每日全量备份，每小时增量备份，备份数据保留 30 天。详细灾备方案可由运维团队提供。",
    category: "security",
    documentSource: "灾备方案文档"
  },
  {
    question: "是否支持多因素认证（MFA）？",
    answer: "支持短信验证码、TOTP 等 MFA 方式。硬件令牌支持需根据部署环境确认。",
    category: "security",
    documentSource: "身份认证说明"
  },
  {
    question: "日志保留多久？",
    answer: "操作日志保留 180 天，审计日志保留 1 年，符合等保要求。",
    category: "security",
    documentSource: "日志管理规范"
  },
  {
    question: "是否有渗透测试报告？",
    answer: "定期委托第三方执行渗透测试，最近一期报告可由安全团队提供，具体结果需人工确认。",
    category: "security",
    documentSource: "安全测试记录"
  },
  {
    question: "数据存储在哪里？",
    answer: "数据存储在中国境内的自建 IDC 机房，符合数据本地化要求。",
    category: "compliance",
    documentSource: "数据中心说明"
  },
  {
    question: "是否支持 API 接口？",
    answer: "提供 RESTful API 和 Webhook，支持与第三方系统集成。详细 API 文档可在开发者中心获取。",
    category: "product",
    documentSource: "API 文档"
  }
];
```

**所有答案围绕"云图科技"这个统一画像，避免看起来像 AI 随机编造。**

---

## 答案生成（带引用约束）

```typescript
const generatePrompt = `
你是安全问卷回答助手。基于提供的参考答案，回答用户问题。

问题：${question}

参考答案：
${candidates.map((c, i) => `[${i+1}] ${c.answer}\n来源：${c.documentSource}`).join('\n\n')}

要求：
1. 答案必须基于参考答案，不要编造
2. 在答案中标注引用编号 [1] [2]
3. 如果参考答案不足，直接说"需要人工确认"
4. 保持专业、简洁

回答：
`;
```

## 检索策略（向量 + 轻量重排）

```typescript
async function retrieveAnswers(questionText: string) {
  // 1. 向量检索 top 5
  const embedding = await generateEmbedding(questionText);
  const vectorResults = await db.query(`
    SELECT *, 1 - (embedding <=> $1) as similarity
    FROM knowledge_base
    ORDER BY embedding <=> $1
    LIMIT 5
  `, [embedding]);

  // 2. 轻量关键词重排
  const keywords = extractKeywords(questionText); // SSO, 等保, 加密等
  const reranked = vectorResults.map(r => {
    let score = r.similarity;

    // category 匹配加权
    if (keywords.some(k => r.category.includes(k))) {
      score += 0.1;
    }

    // 关键词命中加权
    const hitCount = keywords.filter(k =>
      r.question.includes(k) || r.answer.includes(k)
    ).length;
    score += hitCount * 0.05;

    return { ...r, finalScore: score };
  });

  // 3. 返回 top 3
  return reranked
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 3);
}
```

## 答案生成（带引用约束）

```typescript
const generatePrompt = `
你是云图科技的安全问卷回答助手。基于提供的参考答案，回答用户问题。

问题：${question}

参考答案：
${candidates.map((c, i) => `[${i+1}] ${c.answer}\n来源：${c.documentSource}`).join('\n\n')}

要求：
1. 答案必须基于参考答案，不要编造
2. 在答案中标注引用编号 [1] [2]
3. 如果参考答案不足，直接说"需要人工确认"
4. 保持专业、简洁

回答：
`;
```

**重点是"不要编造"和"标注引用"。**

---

## 界面（单页面）

```
┌─────────────────────────────────────────────┐
│  安全问卷自动答卷 Demo                        │
│  [上传 Excel]                                │
├──────────┬──────────────────────────────────┤
│          │                                  │
│ 问题列表  │  当前问题详情                      │
│          │                                  │
│ □ Q1     │  问题：是否支持 SSO？              │
│ SSO      │                                  │
│          │  AI 答案：                        │
│ □ Q2     │  支持基于 SAML 2.0 和 OIDC 的     │
│ 加密      │  单点登录 [1]                     │
│          │                                  │
│ □ Q3     │  参考依据：                       │
│ 等保      │  [1] 产品安全白皮书 v3.2          │
│          │  "支持基于 SAML 2.0..."          │
│          │                                  │
│          │  [编辑答案] [复制]                │
└──────────┴──────────────────────────────────┘
```

**UI 文案说明：**
- 使用"参考依据"而非"来源"或"证据"
- 明确这是"参考历史答案"，不是原始证据追溯
- 支持单个答案复制和全部结果复制

---

## 关键优化点（相比初版）

### 1. 统一公司画像
所有 seed 数据围绕"云图科技"这个假想公司，避免答案看起来像 AI 随机编造。敏感资质类答案降低绝对性，增加"需人工确认"等真实表述。

### 2. 检索稳定性
在向量检索基础上增加轻量关键词重排，通过 category 匹配和关键词命中提升小知识库场景下的检索准确性。

### 3. Excel 解析健壮性
增加预览和列选择功能，自动过滤编号、标题、空行等非问题行，避免真实文件解析失败。

### 4. UI 文案准确性
使用"参考依据"而非"来源"或"证据"，明确当前引用的是历史答案而非原始证据追溯。

### 5. 时间预期合理化
将"< 2 分钟"改为"10 个问题通常 1-2 分钟，20 个问题可接受"，避免过度承诺。

### 6. 基础结果导出
增加复制单个答案和全部结果功能，让 demo 闭环完整，虽不做完整导出但能带走结果。

---

## 风险和限制（明确告知）

### 首版只支持
- ✅ Excel 格式（.xlsx）
- ✅ 简单表格（第一列是问题）
- ✅ 10 条预置知识
- ✅ 本地运行

### 首版不支持
- ❌ Word/PDF
- ❌ 复杂表格
- ❌ 知识库导入
- ❌ 导出功能
- ❌ 多用户
- ❌ 生产部署

---

## 开发计划（7 天）

### Day 1-2: 基础搭建
- Next.js 项目初始化
- PostgreSQL + pgvector 设置
- 数据库 schema
- 预置知识库数据

### Day 3-4: 核心功能
- Excel 上传和解析
- 向量检索
- LLM 答案生成
- 引用关联

### Day 5-6: 界面
- 问题列表组件
- 答案详情组件
- 编辑功能

### Day 7: 测试和优化
- 准备演示数据
- 测试完整流程
- 修复 bug

---

## 成功标准

**Demo 成功 = 能演示这个流程：**

1. 上传一个 Excel 安全问卷（10-20 个问题）
2. 预览并选择问题列
3. 系统自动生成答案
4. 每个答案都有参考依据
5. 用户可以编辑和复制答案
6. 10 个问题通常在 1-2 分钟内完成，20 个问题在演示环境可接受

**不需要：**
- 完美的准确率
- 完整的功能
- 生产级的稳定性

---

## 下一步

如果这个 MVP 验证成功（用户觉得有价值），再考虑：
- 支持 Word/PDF
- 知识库导入
- 导出功能
- 置信度评分
- 部署到 Vercel

**但现在，先把这 7 天的 MVP 做出来。**

---

**End of MVP Spec**
