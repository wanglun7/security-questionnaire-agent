# Security Questionnaire Demo - MVP Implementation Plan

**Date:** 2026-03-25
**Duration:** 7 Days
**Based on:** 2026-03-25-mvp-cut-version.md

---

## Overview

This plan breaks down the MVP into concrete, executable tasks across 7 days. Each day has clear deliverables and verification steps.

**Core Goal:** Build a working demo that uploads Excel questionnaires and generates AI answers with citations.

---

## Day 1: Project Setup & Database

### Tasks

#### 1.1 Initialize Next.js Project
- [ ] Create Next.js 15 project with App Router
- [ ] Install dependencies: `drizzle-orm`, `@neondatabase/serverless`, `postgres`, `pgvector`
- [ ] Install UI: `shadcn/ui` components (button, card, input, textarea, dialog)
- [ ] Install: `xlsx`, `ai` (Vercel AI SDK)
- [ ] Setup TypeScript config

**Files to create:**
- `package.json`
- `tsconfig.json`
- `next.config.js`

#### 1.2 Setup PostgreSQL + pgvector
- [ ] Install PostgreSQL locally or use Docker
- [ ] Enable pgvector extension: `CREATE EXTENSION vector;`
- [ ] Test connection

**Verification:**
```bash
psql -d your_db -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

#### 1.3 Define Database Schema
- [ ] Create Drizzle schema file
- [ ] Define tables: projects, questions, answers, answer_sources, knowledge_base
- [ ] Add vector column for embeddings

**File to create:**
- `lib/db/schema.ts`

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
  rank: integer('rank').notNull(), // 1, 2, 3 for display order
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
- [ ] Generate migration: `drizzle-kit generate`
- [ ] Apply migration: `drizzle-kit push`

**Verification:**
```bash
psql -d your_db -c "\dt"
```

#### 1.5 Setup Environment Variables
- [ ] Create `.env.local`
- [ ] Add DATABASE_URL
- [ ] Add OPENAI_BASE_URL and OPENAI_API_KEY

**File to create:**
- `.env.local`

```
DATABASE_URL=postgresql://user:password@localhost:5432/questionnaire_demo
OPENAI_BASE_URL=http://154.17.30.28:8080
OPENAI_API_KEY=your-api-key
```

### Day 1 Deliverables
- ✅ Next.js project running on localhost:3000
- ✅ Database with all tables created
- ✅ pgvector extension enabled
- ✅ Environment variables configured

---

## Day 2: Seed Data & AI Integration

### Tasks

#### 2.1 Create Seed Data
- [ ] Create seed data file with 10 knowledge entries
- [ ] All entries follow "云图科技" company profile

**File to create:**
- `lib/seed-data.ts`

```typescript
export const seedKnowledge = [
  {
    question: "是否支持 SSO 单点登录？",
    answer: "支持基于 SAML 2.0 和 OIDC 的单点登录，可与企业统一身份平台集成。具体配置方式请联系技术支持团队。",
    category: "security",
    documentSource: "产品安全白皮书 v3.2"
  },
  // ... 9 more entries (see spec)
];
```

#### 2.2 Generate Embeddings for Seed Data
- [ ] Create embedding generation function using Vercel AI SDK
- [ ] Generate embeddings for all 10 seed entries
- [ ] Insert into knowledge_base table

**File to create:**
- `lib/ai/embeddings.ts`

```typescript
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function generateEmbedding(text: string) {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: text,
  });
  return embedding;
}
```

**Script to create:**
- `scripts/seed-knowledge.ts`

```typescript
import { db } from '@/lib/db/client';
import { knowledgeBase } from '@/lib/db/schema';
import { seedKnowledge } from '@/lib/seed-data';
import { generateEmbedding } from '@/lib/ai/embeddings';

async function seed() {
  for (const entry of seedKnowledge) {
    const embedding = await generateEmbedding(entry.question + ' ' + entry.answer);
    await db.insert(knowledgeBase).values({
      ...entry,
      embedding
    });
  }
  console.log('Seeded', seedKnowledge.length, 'entries');
}

seed();
```

#### 2.3 Setup Vercel AI SDK
- [ ] Configure OpenAI provider with custom endpoint
- [ ] Test LLM generation
- [ ] Test embedding generation

**File to create:**
- `lib/ai/client.ts`

```typescript
import { createOpenAI } from '@ai-sdk/openai';

export const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});
```

#### 2.4 Test Vector Search
- [ ] Create vector search function
- [ ] Test with sample query

**File to create:**
- `lib/db/search.ts`

```typescript
import { db } from './client';
import { knowledgeBase } from './schema';
import { sql } from 'drizzle-orm';

export async function vectorSearch(embedding: number[], limit = 5) {
  const results = await db.execute(sql`
    SELECT *, 1 - (embedding <=> ${embedding}::vector) as similarity
    FROM ${knowledgeBase}
    ORDER BY embedding <=> ${embedding}::vector
    LIMIT ${limit}
  `);
  return results.rows;
}
```

### Day 2 Deliverables
- ✅ 10 knowledge entries in database with embeddings
- ✅ AI SDK configured and tested
- ✅ Vector search working

---

## Day 3: Excel Upload & Parsing

### Tasks

#### 3.1 Create Upload API
- [ ] Create file upload endpoint
- [ ] Save file to local filesystem
- [ ] Return file path

**File to create:**
- `app/api/upload/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file || !file.name.endsWith('.xlsx')) {
    return Response.json({ error: 'Invalid file' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: 'File too large' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const filePath = join(process.cwd(), 'uploads', `${Date.now()}-${file.name}`);
  await writeFile(filePath, buffer);

  return Response.json({ filePath });
}
```

#### 3.2 Create Preview API
- [ ] Parse Excel and return first 20 rows
- [ ] Return sheet names

**File to create:**
- `app/api/preview/route.ts`

```typescript
import { NextRequest } from 'next/server';
import XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  const { filePath } = await req.json();

  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const sheet = workbook.Sheets[sheetNames[0]];
  const preview = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 20);

  return Response.json({ sheetNames, preview });
}
```

#### 3.3 Create Parse API
- [ ] Parse Excel based on user-selected column
- [ ] Filter non-questions
- [ ] Create project and questions in database

**File to create:**
- `app/api/parse/route.ts`

```typescript
import { NextRequest } from 'next/server';
import XLSX from 'xlsx';
import { db } from '@/lib/db/client';
import { projects, questions } from '@/lib/db/schema';

function isNonQuestion(text: string): boolean {
  return /^[\d\.]+$/.test(text) ||
         /^第[一二三四五六七八九十\d]+[章节条]/.test(text) ||
         /^(是|否|N\/A|Yes|No)$/i.test(text);
}

export async function POST(req: NextRequest) {
  const { filePath, sheetIndex, columnIndex, projectName } = await req.json();

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[sheetIndex]];
  const data = XLSX.utils.sheet_to_json(sheet);

  const questionTexts = data
    .map((row: any, index) => ({
      text: Object.values(row)[columnIndex] as string,
      order: index + 1
    }))
    .filter(q => q.text && q.text.length > 5 && !isNonQuestion(q.text));

  // Create project
  const [project] = await db.insert(projects).values({
    name: projectName,
    filePath,
    status: 'processing'
  }).returning();

  // Create questions
  await db.insert(questions).values(
    questionTexts.map(q => ({
      projectId: project.id,
      text: q.text,
      orderNum: q.order
    }))
  );

  return Response.json({ projectId: project.id, questionCount: questionTexts.length });
}
```

### Day 3 Deliverables
- ✅ File upload working
- ✅ Excel preview working
- ✅ Excel parsing with column selection working
- ✅ Questions saved to database

---

## Day 4: Answer Generation Pipeline

### Tasks

#### 4.1 Create Retrieval Function with Reranking
- [ ] Implement vector search + keyword reranking
- [ ] Extract keywords from question
- [ ] Return top 3 candidates

**File to create:** `lib/retrieval/search.ts`

#### 4.2 Create Answer Generation Function
- [ ] Build prompt with candidates
- [ ] Call LLM via Vercel AI SDK
- [ ] Parse response with citations

**File to create:** `lib/ai/generate.ts`

#### 4.3 Create Process API
- [ ] Retrieve questions for project
- [ ] For each question: retrieve + generate + save
- [ ] Update project status to 'ready'

**File to create:** `app/api/process/route.ts`

### Day 4 Deliverables
- ✅ Retrieval with reranking working
- ✅ Answer generation working
- ✅ Full processing pipeline working
- ✅ Answers and sources saved to database

---

## Day 5: Frontend - Upload & Preview

### Tasks

#### 5.1 Create Upload Page
- [ ] File upload component with drag-and-drop
- [ ] File validation (xlsx, < 5MB)
- [ ] Upload progress indicator

**File to create:** `app/page.tsx`

#### 5.2 Create Preview Page
- [ ] Display Excel preview (first 20 rows)
- [ ] Sheet selector
- [ ] Column selector
- [ ] Project name input
- [ ] Start processing button

**File to create:** `app/preview/page.tsx`

### Day 5 Deliverables
- ✅ Upload page working
- ✅ Preview page with column selection working
- ✅ Can trigger processing pipeline

---

## Day 6: Frontend - Results Display

### Tasks

#### 6.1 Create Project Results Page
- [ ] Two-column layout: questions list + answer detail
- [ ] Fetch project data with questions and answers
- [ ] Display question list on left
- [ ] Display selected question detail on right

**File to create:** `app/project/[id]/page.tsx`

#### 6.2 Create Question List Component
- [ ] Display all questions with order number
- [ ] Show short preview of each question
- [ ] Highlight selected question
- [ ] Click to select question

**File to create:** `components/question-list.tsx`

#### 6.3 Create Answer Detail Component
- [ ] Display full question text
- [ ] Display AI-generated answer
- [ ] Display "参考依据" section with sources
- [ ] Show source document names and snippets
- [ ] Editable textarea for answer
- [ ] Save edited answer to database

**File to create:** `components/answer-detail.tsx`

#### 6.4 Create Edit Answer API
- [ ] Update edited_content field
- [ ] Return success response

**File to create:** `app/api/answers/[id]/route.ts`

### Day 6 Deliverables
- ✅ Results page with two-column layout working
- ✅ Can view all questions and answers
- ✅ Can edit answers
- ✅ Sources displayed correctly

---

## Day 7: Polish & Testing

### Tasks

#### 7.1 Add Copy Functionality
- [ ] Copy single answer button
- [ ] Copy all results button
- [ ] Show toast notification on copy

**Update:** `components/answer-detail.tsx`

#### 7.2 Add Loading States
- [ ] Upload loading spinner
- [ ] Processing loading spinner
- [ ] Skeleton loaders for results page

#### 7.3 Add Error Handling
- [ ] File upload errors
- [ ] Processing errors
- [ ] Display error messages to user

#### 7.4 Create Demo Data
- [ ] Prepare sample Excel questionnaire (10-20 questions)
- [ ] Include realistic security questions
- [ ] Test full flow with demo data

#### 7.5 End-to-End Testing
- [ ] Test upload → preview → parse → process → results
- [ ] Test with 10 questions (verify < 2 min)
- [ ] Test with 20 questions
- [ ] Test edit functionality
- [ ] Test copy functionality
- [ ] Verify all sources display correctly

#### 7.6 Bug Fixes & Polish
- [ ] Fix any bugs found during testing
- [ ] Improve UI/UX based on testing
- [ ] Add basic styling polish

### Day 7 Deliverables
- ✅ Copy functionality working
- ✅ Loading states implemented
- ✅ Error handling implemented
- ✅ Demo data prepared
- ✅ Full flow tested and working
- ✅ Ready for demo

---

## Final Checklist

### Core Functionality
- [ ] Upload Excel file (< 5MB, .xlsx only)
- [ ] Preview Excel with column selection
- [ ] Parse questions from selected column
- [ ] Generate embeddings for questions
- [ ] Retrieve top 3 similar answers from knowledge base
- [ ] Generate AI answers with citations
- [ ] Display results in two-column layout
- [ ] Edit answers
- [ ] Copy single answer
- [ ] Copy all results

### Database
- [ ] All 5 tables created
- [ ] pgvector extension enabled
- [ ] 10 knowledge entries seeded with embeddings
- [ ] Migrations working

### API Endpoints
- [ ] POST /api/upload - Upload file
- [ ] POST /api/preview - Preview Excel
- [ ] POST /api/parse - Parse questions
- [ ] POST /api/process - Generate answers
- [ ] GET /api/project/[id] - Get project results
- [ ] PATCH /api/answers/[id] - Update answer

### UI Pages
- [ ] / - Upload page
- [ ] /preview - Preview and column selection
- [ ] /project/[id] - Results display

### Performance
- [ ] 10 questions complete in 1-2 minutes
- [ ] 20 questions complete in acceptable time

### Demo Readiness
- [ ] Sample Excel file prepared
- [ ] Knowledge base seeded
- [ ] Full flow tested
- [ ] No critical bugs

---

## Success Criteria Met

✅ User can upload Excel questionnaire
✅ User can preview and select question column
✅ System generates answers with citations
✅ Each answer shows "参考依据" (reference sources)
✅ User can edit answers
✅ User can copy results
✅ Processing time acceptable for demo

---

## Post-MVP Improvements (Not in Scope)

- Word/PDF support
- Knowledge base management UI
- Historical projects list
- Export to Word/Excel
- Confidence scoring
- Question categorization
- SSE real-time progress
- Multi-user support
- Production deployment

---

**End of Implementation Plan**
