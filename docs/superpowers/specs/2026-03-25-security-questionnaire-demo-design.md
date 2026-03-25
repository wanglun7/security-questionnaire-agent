# Security Questionnaire Auto-Response System - Design Document

**Date:** 2026-03-25
**Status:** Approved
**Author:** Design Session

## 1. Overview

### Purpose
Build a complete demo of an automated security questionnaire response system for Chinese ToB enterprises. The system helps companies quickly complete customer security questionnaires by automatically extracting questions, retrieving historical answers from a knowledge base, and generating draft responses with source citations.

### Target Users
- ToB SaaS/software companies selling to finance, government, healthcare sectors
- Pre-sales engineers and security/compliance teams
- Companies that receive 3-5+ security questionnaires per month

### Core Value Proposition
Transform a multi-day manual process (searching old documents, coordinating across teams, drafting responses) into a few hours with AI-assisted automation while maintaining human oversight.

## 2. System Architecture

### Technology Stack
- **Frontend:** Next.js 15 App Router + React + shadcn/ui + Tailwind CSS
- **Backend:** Next.js API Routes + Server Actions
- **Workflow Engine:** Mastra (manages processing pipeline)
- **LLM Integration:** Vercel AI SDK + Custom OpenAI-compatible endpoint (gpt-5.2)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions) via custom endpoint
- **Database:** PostgreSQL + pgvector (stores questionnaires, questions, answers, embeddings)
- **File Storage:** Vercel Blob (uploaded files and exports)
- **Document Parsing:** pdf-parse, mammoth, xlsx
- **Progress Tracking:** Server-Sent Events (SSE) for real-time updates
- **Export:** docx library for Word export

### Deployment
- Local development: `npm run dev`
- Production: Vercel (or any Next.js-compatible platform)

### High-Level Flow
```
User uploads questionnaire file
    ↓
Mastra Workflow processes automatically
    ↓
1. Parse document (PDF/Word/Excel)
2. Extract question list
3. Retrieve similar answers from knowledge base
4. Generate draft with source citations
5. Calculate confidence scores
    ↓
User reviews/edits in UI
    ↓
Export results (Word/Excel)
```

## 3. Data Model

### Database Schema

**Projects Table**
```typescript
{
  id: string (uuid)
  name: string
  uploadedFileUrl: string       // Vercel Blob URL
  fileType: 'pdf' | 'word' | 'excel'
  status: 'processing' | 'ready' | 'completed' | 'error'
  errorMessage: string          // Error details if status is 'error'
  progress: integer (0-100)     // Processing progress percentage
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Questions Table**
```typescript
{
  id: string (uuid)
  projectId: string (foreign key)
  originalText: string          // Original question text
  category: string              // Classification (security/product/compliance)
  order: integer                // Display order
  status: 'pending' | 'answered' | 'confirmed'
  createdAt: timestamp
}
```

**Answers Table**
```typescript
{
  id: string (uuid)
  questionId: string (foreign key)
  content: string               // AI-generated answer
  confidence: integer (0-100)   // Confidence score
  isEdited: boolean            // Whether manually edited
  editedContent: string        // Edited content
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Sources Table**
```typescript
{
  id: string (uuid)
  answerId: string (foreign key)
  documentName: string         // Source document name
  snippet: string             // Citation snippet
  relevanceScore: float       // Relevance score
}
```

**KnowledgeBase Table**
```typescript
{
  id: string (uuid)
  question: string
  answer: string
  category: string
  documentSource: string
  embedding: vector(1536)     // pgvector for semantic search
  lastUpdated: timestamp
}
```

## 4. Mastra Workflow Design

### Workflow Initialization
```typescript
// lib/mastra/client.ts
import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  workflows: [questionnaireWorkflow],
  // Workflow state stored in PostgreSQL
  storage: {
    type: 'postgres',
    connectionString: process.env.DATABASE_URL,
  },
});
```

### Triggering Workflow from API
```typescript
// app/api/workflow/route.ts
import { mastra } from '@/lib/mastra/client';

export async function POST(req: Request) {
  const { projectId, fileUrl } = await req.json();

  // Start workflow in background
  const execution = await mastra.workflows.questionnaireWorkflow.execute({
    projectId,
    fileUrl,
  });

  return Response.json({ executionId: execution.id });
}
```

### Progress Tracking via SSE
```typescript
// app/api/progress/[projectId]/route.ts
export async function GET(req: Request, { params }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Poll workflow status every 2 seconds
      const interval = setInterval(async () => {
        const project = await db.query.projects.findFirst({
          where: eq(projects.id, params.projectId)
        });

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(project)}\n\n`)
        );

        if (project.status !== 'processing') {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

### Workflow Definition
```typescript
const questionnaireWorkflow = new Workflow({
  name: 'process-questionnaire',
  steps: [
    {
      id: 'parse-document',
      execute: parseDocument,
      // Input: file path
      // Output: text content
    },
    {
      id: 'extract-questions',
      execute: extractQuestions,
      // Input: text content
      // Output: question list
      // Uses: LLM via Vercel AI SDK
    },
    {
      id: 'classify-questions',
      execute: classifyQuestions,
      // Input: question list
      // Output: classified question list
      // Uses: LLM
    },
    {
      id: 'retrieve-answers',
      execute: retrieveFromKnowledgeBase,
      // Input: question list
      // Output: candidate answers for each question
      // Uses: pgvector semantic search
    },
    {
      id: 'generate-drafts',
      execute: generateDrafts,
      // Input: questions + candidate answers
      // Output: draft answers with citations
      // Uses: LLM with constrained generation
    },
    {
      id: 'calculate-confidence',
      execute: calculateConfidence,
      // Input: draft answers + sources
      // Output: confidence scores
      // Uses: LLM evaluation
    },
  ]
})
```

### Step Responsibilities

**Step 1: parseDocument**
- Pure function, no external dependencies
- Handles PDF/Word/Excel parsing
- Returns plain text content

**Steps 2-3: extract + classify**
- LLM calls via Vercel AI SDK
- Structured output (JSON)
- Error handling with retries

**Step 4: retrieve**
- Vector similarity search in pgvector
- Hybrid search: semantic + keyword matching
- Returns top 3-5 candidates per question

**Steps 5-6: generate + confidence**
- LLM generation with source constraints
- Confidence scoring based on source quality
- Marks low-confidence items for human review

## 5. Frontend Design

### Page Structure

**1. Upload Page (`/`)**
- File upload component (drag-and-drop)
- Supports PDF/Word/Excel
- Historical project list
- Click project to view details

**2. Question List Page (`/project/[id]`)**

Three-column layout:
```
┌─────────────────────────────────────────────┐
│  [Export] [Knowledge Base]                  │
├──────────┬──────────────────────────────────┤
│          │                                  │
│ Question │  Current Question Details        │
│ List     │                                  │
│ (Left)   │  (Right)                         │
│          │                                  │
│ □ Q1     │  Question: Does it support SSO?  │
│ [Security]│                                 │
│ ⭐⭐⭐⭐⭐  │  AI Answer:                      │
│          │  Supports SAML 2.0-based...      │
│ □ Q2     │                                  │
│ [Security]│  Confidence: High (92%)         │
│ ⭐⭐⭐⭐☆  │                                  │
│          │  Sources:                        │
│ ✓ Q3     │  • Product Security Doc v3.2     │
│ [Impl]   │  • Historical Q&A 2025Q1         │
│ ⭐⭐⭐☆☆  │                                  │
│          │  [Edit] [Confirm]                │
└──────────┴──────────────────────────────────┘
```

**3. Knowledge Base Page (`/knowledge`)**
- Upload historical documents
- View existing knowledge entries
- Edit/delete entries
- Import functionality

### UI Components (shadcn/ui)
- Button, Card, Input, Textarea
- Dialog, DropdownMenu, Select
- Table, Tabs, Badge
- Progress, Skeleton (loading states)

## 6. Core Implementation Details

### 1. Document Parsing
- **PDF**: `pdf-parse` library
- **Word**: `mammoth` library
- **Excel**: `xlsx` library
- Output: plain text content

### 2. Question Extraction (LLM)
```typescript
const extractPrompt = `
Extract all questions from the following document.
One question per line, keep original text.

Document content:
${documentText}

Output JSON format:
[
  { "question": "Question 1", "order": 1 },
  { "question": "Question 2", "order": 2 }
]
`
```

### 3. Vector Retrieval (RAG)
- Convert question to embedding
- Search pgvector for most similar knowledge base entries
- Hybrid search: vector similarity + keyword matching
- Return top 3-5 candidate answers

### 4. Answer Generation (LLM + Constraints)
```typescript
const generatePrompt = `
Answer the question based on the following reference materials.

Question: ${question}

Reference materials:
${sources.map(s => `- ${s.answer} (Source: ${s.documentSource})`).join('\n')}

Requirements:
1. Answer must be based on reference materials
2. Cite sources
3. If insufficient information, state "Requires manual confirmation"
`
```

### 5. Confidence Calculation

**Formula:**
```typescript
confidence = Math.min(
  (semanticSimilarity * 40 +      // 0-1 from vector search
   sourceCount * 10 +              // More sources = higher confidence
   sourceQuality * 30),            // 0-1 based on document type
  100
)
```

- Output: 0-100 score
- < 70: mark for human review

## 7. Error Handling

### Error Scenarios

**1. File Upload Failure**
- Validate file type and size
- Display friendly error message
- Support re-upload

**2. Document Parsing Failure**
- Catch parsing errors
- Log for debugging
- Prompt: "Document format not supported, please convert and retry"

**3. LLM Call Failure**
- Auto-retry (max 3 attempts)
- Timeout handling (30 seconds)
- Fallback: mark as "Requires manual processing"

**4. Empty Knowledge Base**
- Check if knowledge base has content
- If empty, prompt user to import first
- Provide sample data

**5. No Vector Search Results**
- Return empty list
- Mark as "No similar answers found"
- Still call LLM to generate answer, but set low confidence

## 8. Project Structure

```
/agent
├── app/
│   ├── page.tsx                    # Upload page
│   ├── project/[id]/page.tsx       # Question list page
│   ├── knowledge/page.tsx          # Knowledge base management
│   └── api/
│       ├── upload/route.ts         # File upload endpoint
│       ├── workflow/route.ts       # Workflow trigger
│       └── knowledge/route.ts      # Knowledge base CRUD
├── lib/
│   ├── mastra/
│   │   └── workflow.ts             # Mastra workflow definition
│   ├── ai/
│   │   └── client.ts               # Vercel AI SDK config
│   ├── db/
│   │   ├── schema.ts               # Drizzle ORM schema
│   │   └── client.ts               # Database client
│   └── parsers/
│       ├── pdf.ts                  # PDF parser
│       ├── word.ts                 # Word parser
│       └── excel.ts                # Excel parser
├── components/
│   ├── ui/                         # shadcn/ui components
│   ├── upload-form.tsx
│   ├── question-list.tsx
│   └── answer-detail.tsx
├── .env.local                      # Environment variables
├── package.json
└── drizzle.config.ts
```

## 9. Environment Configuration

### Required Environment Variables
```
OPENAI_BASE_URL=http://154.17.30.28:8080
OPENAI_API_KEY=your-api-key
DATABASE_URL=postgresql://user:password@host:port/database
```

### Development Setup
1. Install dependencies: `npm install`
2. Setup database: `npm run db:push`
3. Run dev server: `npm run dev`

### Production Deployment
1. Build: `npm run build`
2. Deploy to Vercel: `vercel deploy`
3. Configure environment variables in Vercel dashboard

## 10. Success Criteria

### Functional Requirements
- ✅ Upload PDF/Word/Excel questionnaires
- ✅ Automatically extract questions
- ✅ Retrieve similar answers from knowledge base
- ✅ Generate draft answers with source citations
- ✅ Display confidence scores
- ✅ Allow manual editing
- ✅ Export results
- ✅ Import knowledge base documents

### Non-Functional Requirements
- ✅ Response time < 30 seconds for typical questionnaire
- ✅ Support files up to 10MB
- ✅ Handle 50+ questions per questionnaire
- ✅ Mobile-responsive UI
- ✅ Deployable to Vercel

## 11. Export Implementation

### Word Export
```typescript
// Using docx library
import { Document, Packer, Paragraph, TextRun } from 'docx';

async function exportToWord(projectId: string) {
  const questions = await getQuestionsWithAnswers(projectId);

  const doc = new Document({
    sections: [{
      children: questions.map(q => [
        new Paragraph({
          children: [new TextRun({ text: q.originalText, bold: true })]
        }),
        new Paragraph({
          children: [new TextRun(q.answer.editedContent || q.answer.content)]
        }),
        new Paragraph({ text: '' }) // Spacing
      ]).flat()
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
```

## 12. Knowledge Base Import Workflow

### Import Process
1. User uploads historical document (PDF/Word)
2. Parse document into text
3. Chunk text into Q&A pairs using LLM
4. Generate embeddings for each pair
5. Store in knowledge_base table
6. Show import progress via SSE

### Chunking Strategy
```typescript
const chunkPrompt = `
Extract Q&A pairs from this document.

Document: ${text}

Output JSON:
[
  { "question": "...", "answer": "...", "category": "security" }
]
`;
```

## 13. Database Migration Strategy

### Using Drizzle Kit
```bash
# Generate migration
npm run db:generate

# Apply migration
npm run db:migrate

# Push schema (dev only)
npm run db:push
```

### Migration Files
- Stored in `drizzle/migrations/`
- Version controlled
- Applied sequentially

## 14. Vercel Deployment Constraints

### Handling Long-Running Workflows

**Problem:** Vercel serverless timeout (10s Hobby, 60s Pro)

**Solution:** Background processing
```typescript
// Trigger workflow, return immediately
export async function POST(req: Request) {
  const { projectId, fileUrl } = await req.json();

  // Start workflow asynchronously
  mastra.workflows.questionnaireWorkflow.execute({
    projectId,
    fileUrl,
  }).catch(err => {
    // Update project status to 'error'
    updateProjectStatus(projectId, 'error', err.message);
  });

  // Return immediately
  return Response.json({ status: 'processing' });
}
```

Client polls via SSE for progress updates.

## 15. Sample Knowledge Base Data

### Initial Seed Data
```typescript
const sampleKnowledge = [
  {
    question: "是否支持 SSO 单点登录？",
    answer: "支持基于 SAML 2.0 和 OIDC 的单点登录，可与企业统一身份平台集成。",
    category: "security",
    documentSource: "产品安全白皮书 v3.2"
  },
  {
    question: "数据是否加密存储？",
    answer: "所有数据采用 AES-256 加密存储，密钥由 KMS 管理。",
    category: "security",
    documentSource: "数据安全说明文档"
  },
  {
    question: "是否通过等保三级认证？",
    answer: "已通过等保三级测评，证书编号：XXXX，有效期至 2026 年。",
    category: "compliance",
    documentSource: "等保测评报告"
  }
];
```

## 16. Future Enhancements (Out of Scope for Demo)

- Multi-user collaboration
- Approval workflows
- CRM integration
- Automatic expert assignment
- Trust Center / public FAQ page
- Multi-language support
- Advanced analytics

---

**End of Design Document**
