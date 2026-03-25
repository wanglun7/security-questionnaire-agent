import { pgTable, uuid, text, timestamp, integer, vector, boolean } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  originalFileName: text('original_file_name').notNull(),
  filePath: text('file_path').notNull(),
  status: text('status').notNull(),
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
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at').defaultNow()
});
