import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const thoughts = pgTable(
  "thoughts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rawText: text("raw_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    thoughtType: text("thought_type").notNull(),
    people: text("people")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    topics: text("topics")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    actionItems: text("action_items")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text("status").notNull().default("untriaged"),
    source: text("source").notNull().default("manual"),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    embeddingIdx: index("thoughts_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    typeIdx: index("thoughts_type_idx").on(table.thoughtType),
    statusIdx: index("thoughts_status_idx").on(table.status),
    createdIdx: index("thoughts_created_idx").on(table.createdAt),
  })
);

export type Thought = typeof thoughts.$inferSelect;
export type NewThought = typeof thoughts.$inferInsert;
