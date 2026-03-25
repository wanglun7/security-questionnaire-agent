# Security Questionnaire Demo - MVP Implementation Plan v2

**Date:** 2026-03-25
**Duration:** 7 Days
**Based on:** 2026-03-25-mvp-cut-version.md
**Version:** 2.0 (修复工程顺序和状态管理问题)

---

## 核心改进点

相比 v1，本版本修复了以下关键问题：

1. **P0**: 上传后立即创建 project，所有 API 围绕 projectId 而非 filePath
2. **P0**: Schema 补齐：status 状态、needs_review、rank、source_row_num
3. **P0**: 统一使用二维数组解析 Excel，避免对象模式的列索引问题
4. **P0**: Day 2 提前验证最小 AI 闭环，降低 Day 4 风险
5. **P1**: 明确定义 GET /api/projects/[id] 聚合接口
6. **P1**: Process API 增加失败兜底和部分成功策略
7. **P1**: Day 3 增加 question list 可视化检查
8. **P2**: 前端优先跑通链路，不优先做装饰
9. **P2**: Day 4 增加人工质量 review 节点

---

## Day 1: Project Setup & Database

### Tasks

#### 1.1 Initialize Next.js Project
- [ ] Create Next.js 15 project with App Router
- [ ] Install dependencies: `drizzle-orm`, `postgres`, `pgvector`, `xlsx`, `ai`
- [ ] Install UI: `shadcn/ui` (button, card, input, textarea, select)
- [ ] Setup TypeScript config

#### 1.2 Setup PostgreSQL + pgvector
- [ ] Install PostgreSQL locally or Docker
- [ ] Enable pgvector: `CREATE EXTENSION vector;`
- [ ] Test connection

#### 1.3 Define Database Schema (完整版)

**File:** `lib/db/schema.ts`

```typescript
import { pgTable, uuid, text, timestamp, integer, vector, boolean } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  originalFileName: text('original_file_name').notNull(),
  filePath: text('file_path').notNull(),
  status: text('status').notNull(), // 'uploaded' | 'parsing' | 'processing' | 'ready' | 'failed'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow()
});

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id),
  text: text('text').notNull(),
  orderNum: integer('order_num').notNull(),
  sourceSheetName: text('source_sheet_name'),
  sourceRowNum: integer('source_row_num'),
  createdAt: timestamp('created_at').defaultNow()
});

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').references(() => questions.id),
  content: text('content').notNull(),
  editedContent: text('edited_content'),
  needsReview: boolean('needs_review').default(false),
  createdAt: timestamp('created_at').defaultNow()
});

export const answerSources = pgTable('answer_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  answerId: uuid('answer_id').references(() => answers.id),
  kbEntryId: uuid('kb_entry_id'),
  sourceText: text('source_text'),
  rank: integer('rank').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

export const knowledgeBase = pgTable('knowledge_base', {
  id: uuid('id').primaryKey().defaultRandom(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  category: text('category').notNull(),
  documentSource: text('document_source').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').defaultNow()
});
```

#### 1.4 Run Migrations
- [ ] Generate: `drizzle-kit generate`
- [ ] Apply: `drizzle-kit push`

#### 1.5 Setup Environment
- [ ] Create `.env.local`
- [ ] Add DATABASE_URL, OPENAI_BASE_URL, OPENAI_API_KEY

### Day 1 Deliverables
- ✅ Next.js running on localhost:3000
- ✅ Database with 5 tables + pgvector
- ✅ Schema 包含所有必要字段

---

## Day 2: Seed Data & AI 闭环验证

### 核心目标
**Day 2 最重要的是验证核心技术链路，不只是准备数据。**

### Tasks

#### 2.1 Create Seed Data
- [ ] 创建 10 条知识库数据（云图科技画像）
- [ ] 所有答案避免绝对性表述

**File:** `lib/seed-data.ts`

#### 2.2 Setup AI Client
- [ ] 配置 Vercel AI SDK with custom endpoint
- [ ] 测试连接

**File:** `lib/ai/client.ts`

```typescript
import { createOpenAI } from '@ai-sdk/openai';

export const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});
```

#### 2.3 Create Embedding Function
- [ ] 实现 embedding 生成

**File:** `lib/ai/embeddings.ts`

```typescript
import { embed } from 'ai';
import { openai } from './client';

export async function generateEmbedding(text: string) {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: text,
  });
  return embedding;
}
```

#### 2.4 Seed Knowledge Base
- [ ] 为每条 seed 数据生成 embedding
- [ ] 插入数据库

**Script:** `scripts/seed-knowledge.ts`

#### 2.5 **验证最小 AI 闭环（关键）**
- [ ] 手写一个测试问题："是否支持 SSO？"
- [ ] 生成 embedding
- [ ] 向量检索 top 3
- [ ] 调用 LLM 生成答案
- [ ] 打印结果验证

**Script:** `scripts/test-ai-pipeline.ts`

```typescript
import { generateEmbedding } from '@/lib/ai/embeddings';
import { db } from '@/lib/db/client';
import { knowledgeBase } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { generateText } from 'ai';
import { openai } from '@/lib/ai/client';

async function testPipeline() {
  const question = "是否支持 SSO 单点登录？";
  
  // 1. Generate embedding
  const embedding = await generateEmbedding(question);
  
  // 2. Vector search
  const results = await db.execute(sql`
    SELECT *, 1 - (embedding <=> ${embedding}::vector) as similarity
    FROM ${knowledgeBase}
    ORDER BY embedding <=> ${embedding}::vector
    LIMIT 3
  `);
  
  console.log('Top 3 results:', results.rows);
  
  // 3. Generate answer
  const candidates = results.rows;
  const prompt = `问题：${question}\n\n参考答案：\n${candidates.map((c, i) => 
    `[${i+1}] ${c.answer}\n来源：${c.document_source}`
  ).join('\n\n')}\n\n要求：基于参考答案回答，标注引用。\n\n回答：`;
  
  const { text } = await generateText({
    model: openai('gpt-5.2'),
    prompt,
  });
  
  console.log('Generated answer:', text);
}

testPipeline();
```

### Day 2 Deliverables
- ✅ 10 条知识库数据已入库，带 embeddings
- ✅ AI SDK 配置完成
- ✅ **最小闭环验证通过：embedding → 检索 → 生成**
- ✅ 确认 prompt 输出质量可接受

---

## Day 3: Upload & Parse (围绕 projectId)

### 核心改进
**所有 API 围绕 projectId，不暴露 filePath 给前端。**

### Tasks

#### 3.1 Create Upload & Create Project API
- [ ] 上传文件并立即创建 project
- [ ] 确保 uploads 目录存在
- [ ] 使用 UUID 文件名，原文件名存 DB

**File:** `app/api/projects/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const projectName = formData.get('name') as string;

  if (!file || !file.name.endsWith('.xlsx')) {
    return Response.json({ error: 'Invalid file' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: 'File too large' }, { status: 400 });
  }

  // Ensure uploads directory exists
  const uploadsDir = join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });

  // Save file with UUID name
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileId = randomUUID();
  const filePath = join(uploadsDir, `${fileId}.xlsx`);
  await writeFile(filePath, buffer);

  // Create project immediately
  const [project] = await db.insert(projects).values({
    name: projectName || file.name,
    originalFileName: file.name,
    filePath,
    status: 'uploaded'
  }).returning();

  return Response.json({ projectId: project.id });
}
```

#### 3.2 Create Preview API
- [ ] 基于 projectId 读取文件
- [ ] 使用二维数组模式解析
- [ ] 返回前 20 行

**File:** `app/api/projects/[id]/preview/route.ts`

```typescript
import { NextRequest } from 'next/server';
import XLSX from 'xlsx';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id)
  });

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  const workbook = XLSX.readFile(project.filePath);
  const sheetNames = workbook.SheetNames;
  const sheet = workbook.Sheets[sheetNames[0]];
  
  // 使用二维数组模式，避免对象模式的列索引问题
  const preview = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 20);

  return Response.json({ sheetNames, preview });
}
```

#### 3.3 Create Parse API
- [ ] 基于用户选择的列解析问题
- [ ] 统一使用二维数组
- [ ] 过滤非问题行
- [ ] 保存 sourceSheetName 和 sourceRowNum

**File:** `app/api/projects/[id]/parse/route.ts`

```typescript
import { NextRequest } from 'next/server';
import XLSX from 'xlsx';
import { db } from '@/lib/db/client';
import { projects, questions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function isNonQuestion(text: string): boolean {
  return /^[\d\.]+$/.test(text) ||
         /^第[一二三四五六七八九十\d]+[章节条]/.test(text) ||
         /^(是|否|N\/A|Yes|No)$/i.test(text);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { sheetIndex, columnIndex } = await req.json();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id)
  });

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  // Update status to parsing
  await db.update(projects)
    .set({ status: 'parsing' })
    .where(eq(projects.id, params.id));

  const workbook = XLSX.readFile(project.filePath);
  const sheetName = workbook.SheetNames[sheetIndex];
  const sheet = workbook.Sheets[sheetName];
  
  // 统一使用二维数组
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const questionTexts = data
    .map((row: any[], index) => ({
      text: row[columnIndex] as string,
      order: index + 1,
      rowNum: index + 1
    }))
    .filter(q => 
      q.text && 
      typeof q.text === 'string' &&
      q.text.length > 5 && 
      !isNonQuestion(q.text)
    );

  // Save questions
  await db.insert(questions).values(
    questionTexts.map(q => ({
      projectId: params.id,
      text: q.text,
      orderNum: q.order,
      sourceSheetName: sheetName,
      sourceRowNum: q.rowNum
    }))
  );

  return Response.json({ 
    questionCount: questionTexts.length,
    status: 'parsed'
  });
}
```

#### 3.4 Create Simple Question List Page
- [ ] 显示已解析的问题列表
- [ ] 验证抽题是否正确

**File:** `app/projects/[id]/questions/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

export default function QuestionsPage({ params }: { params: { id: string } }) {
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    fetch(`/api/projects/${params.id}/questions`)
      .then(res => res.json())
      .then(setQuestions);
  }, [params.id]);

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">已解析问题</h1>
      <ul>
        {questions.map((q: any) => (
          <li key={q.id} className="mb-2">
            Q{q.orderNum}: {q.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**API:** `app/api/projects/[id]/questions/route.ts`

```typescript
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const projectQuestions = await db.query.questions.findMany({
    where: eq(questions.projectId, params.id),
    orderBy: [questions.orderNum]
  });
  return Response.json(projectQuestions);
}
```

### Day 3 Deliverables
- ✅ 上传后立即创建 project（status: uploaded）
- ✅ 所有 API 围绕 projectId
- ✅ 预览使用二维数组，避免对象模式问题
- ✅ 解析保存 sourceSheetName 和 sourceRowNum
- ✅ **可视化检查问题列表，确认抽题正确**

---

## Day 4: Answer Generation + 质量审查

### 核心目标
**生成答案 + 人工审查质量，不只是跑通代码。**

### Tasks

#### 4.1 Create Retrieval with Reranking
- [ ] 向量检索 top 5
- [ ] 关键词重排
- [ ] 返回 top 3

**File:** `lib/retrieval/search.ts`

```typescript
import { generateEmbedding } from '@/lib/ai/embeddings';
import { db } from '@/lib/db/client';
import { knowledgeBase } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

function extractKeywords(text: string): string[] {
  const keywords = ['SSO', '等保', '加密', 'MFA', '备份', '信创', 'API', '日志', '渗透', '数据'];
  return keywords.filter(k => text.includes(k));
}

export async function retrieveAnswers(questionText: string) {
  const embedding = await generateEmbedding(questionText);
  
  const results = await db.execute(sql`
    SELECT *, 1 - (embedding <=> ${embedding}::vector) as similarity
    FROM ${knowledgeBase}
    ORDER BY embedding <=> ${embedding}::vector
    LIMIT 5
  `);

  const keywords = extractKeywords(questionText);
  const reranked = results.rows.map((r: any) => {
    let score = r.similarity;
    
    if (keywords.some(k => r.category.includes(k))) {
      score += 0.1;
    }
    
    const hitCount = keywords.filter(k =>
      r.question.includes(k) || r.answer.includes(k)
    ).length;
    score += hitCount * 0.05;
    
    return { ...r, finalScore: score };
  });

  return reranked
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 3);
}
```

#### 4.2 Create Answer Generation
- [ ] 构建 prompt
- [ ] 调用 LLM
- [ ] 检测是否需要人工确认

**File:** `lib/ai/generate.ts`

```typescript
import { generateText } from 'ai';
import { openai } from './client';

export async function generateAnswer(question: string, candidates: any[]) {
  const prompt = `你是云图科技的安全问卷回答助手。基于提供的参考答案，回答用户问题。

问题：${question}

参考答案：
${candidates.map((c, i) => `[${i+1}] ${c.answer}\n来源：${c.document_source}`).join('\n\n')}

要求：
1. 答案必须基于参考答案，不要编造
2. 在答案中标注引用编号 [1] [2]
3. 如果参考答案不足，直接说"需要人工确认"
4. 保持专业、简洁

回答：`;

  const { text } = await generateText({
    model: openai('gpt-5.2'),
    prompt,
  });

  const needsReview = text.includes('需要人工确认') || 
                      text.includes('需人工') ||
                      candidates.length === 0;

  return { text, needsReview };
}
```

#### 4.3 Create Process API (带失败兜底)
- [ ] 并发处理 3 个问题
- [ ] 单题失败不影响整体
- [ ] 保存 rank 字段

**File:** `app/api/projects/[id]/process/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import { projects, questions, answers, answerSources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { retrieveAnswers } from '@/lib/retrieval/search';
import { generateAnswer } from '@/lib/ai/generate';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await db.update(projects)
    .set({ status: 'processing' })
    .where(eq(projects.id, params.id));

  const projectQuestions = await db.query.questions.findMany({
    where: eq(questions.projectId, params.id),
    orderBy: [questions.orderNum]
  });

  let successCount = 0;
  let failCount = 0;

  // 并发处理 3 个问题
  for (let i = 0; i < projectQuestions.length; i += 3) {
    const batch = projectQuestions.slice(i, i + 3);
    
    await Promise.allSettled(
      batch.map(async (question) => {
        try {
          const candidates = await retrieveAnswers(question.text);
          const { text, needsReview } = await generateAnswer(question.text, candidates);

          const [answer] = await db.insert(answers).values({
            questionId: question.id,
            content: text,
            needsReview
          }).returning();

          await db.insert(answerSources).values(
            candidates.map((c, index) => ({
              answerId: answer.id,
              kbEntryId: c.id,
              sourceText: c.answer,
              rank: index + 1
            }))
          );

          successCount++;
        } catch (error) {
          console.error(`Failed to process question ${question.id}:`, error);
          failCount++;
        }
      })
    );
  }

  const finalStatus = failCount === 0 ? 'ready' : 
                      successCount > 0 ? 'ready' : 'failed';

  await db.update(projects)
    .set({ 
      status: finalStatus,
      errorMessage: failCount > 0 ? `${failCount} questions failed` : null
    })
    .where(eq(projects.id, params.id));

  return Response.json({ 
    success: true, 
    successCount, 
    failCount 
  });
}
```

#### 4.4 **人工质量审查（关键）**
- [ ] 选择 5 个典型问题
- [ ] 检查答案质量
- [ ] 检查引用是否合理
- [ ] 调整 prompt 或 seed 数据

**创建测试问卷：** `test-data/sample-questions.xlsx`
- 包含 5 个典型安全问题
- 运行完整流程
- 人工审查输出

### Day 4 Deliverables
- ✅ 检索 + 重排实现
- ✅ 答案生成实现
- ✅ Process API 支持并发和失败兜底
- ✅ **5 个样例问题人工审查通过**
- ✅ Prompt 和 seed 数据根据审查结果调整

---

## Day 5: Frontend - 流程优先

### 核心原则
**优先跑通流程，不优先做装饰。**

### Tasks

#### 5.1 Upload Page (最简版)
- [ ] 文件上传 input
- [ ] 项目名称 input
- [ ] 上传按钮
- [ ] 跳转到预览页

**File:** `app/page.tsx` (简化版，无 drag-drop)

#### 5.2 Preview & Parse Page
- [ ] 显示 Excel 预览（前 20 行）
- [ ] 列选择器（高亮选中列）
- [ ] 开始解析按钮
- [ ] 解析后跳转到问题列表

**File:** `app/projects/[id]/preview/page.tsx`

#### 5.3 Questions Check Page
- [ ] 显示已解析问题
- [ ] 开始处理按钮
- [ ] 处理中显示简单文本提示

**File:** `app/projects/[id]/questions/page.tsx`

### Day 5 Deliverables
- ✅ 上传 → 预览 → 解析 → 处理 流程跑通
- ✅ 无装饰，但功能完整

---

## Day 6: Results Display + Edit

### Tasks

#### 6.1 Create Project Detail API
- [ ] 聚合返回 project + questions + answers + sources

**File:** `app/api/projects/[id]/route.ts`

```typescript
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: {
      questions: {
        orderBy: [questions.orderNum],
        with: {
          answer: {
            with: {
              sources: {
                orderBy: [answerSources.rank]
              }
            }
          }
        }
      }
    }
  });

  return Response.json(project);
}
```

#### 6.2 Results Page (两栏布局)
- [ ] 左侧问题列表
- [ ] 右侧答案详情
- [ ] 显示参考依据（按 rank 排序）

**File:** `app/projects/[id]/page.tsx`

#### 6.3 Edit Answer
- [ ] Textarea 可编辑
- [ ] 保存到 editedContent

**API:** `app/api/answers/[id]/route.ts`

```typescript
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { editedContent } = await req.json();
  
  await db.update(answers)
    .set({ editedContent })
    .where(eq(answers.id, params.id));

  return Response.json({ success: true });
}
```

### Day 6 Deliverables
- ✅ 聚合 API 返回完整数据
- ✅ 两栏结果页
- ✅ 可编辑答案

---

## Day 7: Polish & Testing

### Tasks

#### 7.1 Add Copy Functionality
- [ ] 复制单个答案按钮
- [ ] 复制全部结果按钮
- [ ] Toast 提示

#### 7.2 Add Basic Loading States
- [ ] 上传中 spinner
- [ ] 处理中文本提示
- [ ] 结果页 skeleton（可选）

#### 7.3 Add Error Handling
- [ ] 上传错误提示
- [ ] 处理失败提示
- [ ] 404 页面

#### 7.4 End-to-End Testing
- [ ] 准备真实样例 Excel（10-20 问题）
- [ ] 测试完整流程
- [ ] 验证 10 问题 < 2 分钟
- [ ] 验证答案质量
- [ ] 验证引用显示

#### 7.5 Bug Fixes
- [ ] 修复测试中发现的问题
- [ ] 调整 UI 细节

### Day 7 Deliverables
- ✅ 复制功能
- ✅ 基础 loading 和 error
- ✅ 完整流程测试通过
- ✅ Demo 就绪

---

## Final Checklist

### Core Functionality
- [ ] 上传 Excel 并立即创建 project
- [ ] 预览 Excel（二维数组模式）
- [ ] 选择列并解析问题
- [ ] 可视化检查问题列表
- [ ] 生成答案（带引用和 rank）
- [ ] 显示参考依据（按 rank 排序）
- [ ] 编辑答案
- [ ] 复制单个/全部答案

### Database
- [ ] 5 tables with complete schema
- [ ] projects.status: uploaded/parsing/processing/ready/failed
- [ ] questions.sourceSheetName + sourceRowNum
- [ ] answers.needsReview
- [ ] answerSources.rank
- [ ] 10 knowledge entries with embeddings

### API Endpoints
- [ ] POST /api/projects - Upload & create project
- [ ] GET /api/projects/[id]/preview - Preview Excel
- [ ] POST /api/projects/[id]/parse - Parse questions
- [ ] GET /api/projects/[id]/questions - List questions
- [ ] POST /api/projects/[id]/process - Generate answers
- [ ] GET /api/projects/[id] - Get full project data
- [ ] PATCH /api/answers/[id] - Update answer

### Key Improvements from v1
- ✅ 所有 API 围绕 projectId，不暴露 filePath
- ✅ Schema 完整，包含所有必要字段
- ✅ 统一使用二维数组解析 Excel
- ✅ Day 2 提前验证 AI 闭环
- ✅ Day 3 可视化检查问题列表
- ✅ Day 4 人工质量审查
- ✅ Process API 支持并发和失败兜底
- ✅ 明确的聚合 API 返回结构

### Performance
- [ ] 10 questions in 1-2 minutes
- [ ] 20 questions acceptable

### Demo Readiness
- [ ] Sample Excel prepared
- [ ] Knowledge base seeded
- [ ] Full flow tested
- [ ] Quality manually reviewed

---

## Success Criteria

✅ 上传 Excel → 预览 → 选列 → 解析 → 处理 → 查看结果
✅ 每个答案显示参考依据（按 rank 排序）
✅ 可编辑和复制答案
✅ 失败不影响整体（部分成功）
✅ 人工审查 5 个样例质量通过

---

## Post-MVP (Not in Scope)

- Word/PDF support
- Knowledge base management
- Historical projects list
- Full export (Word/Excel)
- Confidence scoring
- Question categorization
- SSE real-time progress
- Multi-user
- Production deployment

---

**End of Implementation Plan v2**
