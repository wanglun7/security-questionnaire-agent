import { pgTable, uuid, text, timestamp, integer, vector, boolean, jsonb } from 'drizzle-orm/pg-core';

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

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceUri: text('source_uri').notNull(),
  mimeType: text('mime_type').notNull(),
  originalFilename: text('original_filename').notNull(),
  docType: text('doc_type'),
  checksum: text('checksum'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documentSections = pgTable('document_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documents.id).notNull(),
  parentSectionId: uuid('parent_section_id'),
  kind: text('kind').notNull(),
  title: text('title'),
  textRef: text('text_ref').notNull(),
  spanJson: jsonb('span_json').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documents.id).notNull(),
  sectionId: uuid('section_id').references(() => documentSections.id),
  rawTextRef: text('raw_text_ref').notNull(),
  cleanText: text('clean_text').notNull(),
  contextualText: text('contextual_text'),
  title: text('title'),
  summary: text('summary'),
  keywordsJson: jsonb('keywords_json'),
  entitiesJson: jsonb('entities_json'),
  questionsAnsweredJson: jsonb('questions_answered_json'),
  chunkStrategy: text('chunk_strategy').notNull(),
  spanJson: jsonb('span_json').notNull(),
  authorityGuess: text('authority_guess'),
  reviewStatus: text('review_status').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  metadataVersion: integer('metadata_version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ingestionRuns = pgTable('ingestion_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documents.id).notNull(),
  status: text('status').notNull(),
  parserStrategy: text('parser_strategy'),
  chunkingStrategy: text('chunking_strategy'),
  metricsJson: jsonb('metrics_json'),
  errorJson: jsonb('error_json'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
});

export const ingestionStepTraces = pgTable('ingestion_step_traces', {
  id: uuid('id').primaryKey().defaultRandom(),
  ingestionRunId: uuid('ingestion_run_id').references(() => ingestionRuns.id).notNull(),
  nodeName: text('node_name').notNull(),
  status: text('status').notNull(),
  inputSummaryJson: jsonb('input_summary_json'),
  outputSummaryJson: jsonb('output_summary_json'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
});

export const reviewTasks = pgTable('review_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ingestionRunId: uuid('ingestion_run_id').references(() => ingestionRuns.id).notNull(),
  documentId: uuid('document_id').references(() => documents.id).notNull(),
  scope: text('scope').notNull(),
  scopeRefId: uuid('scope_ref_id'),
  reasonCode: text('reason_code').notNull(),
  summary: text('summary').notNull(),
  status: text('status').notNull().default('pending'),
  resolutionJson: jsonb('resolution_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
