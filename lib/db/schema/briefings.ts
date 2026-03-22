import { pgTable, text, uuid, timestamp, index, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const briefings = pgTable(
  "briefings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    content: text("content").notNull(),
    rawData: jsonb("raw_data").notNull().default({}),
    model: text("model").notNull().default("unknown"),
    costUsd: numeric("cost_usd"),
    tokensUsed: integer("tokens_used"),
    thoughtCount: integer("thought_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    createdIdx: index("idx_briefings_created").on(table.createdAt),
  })
);

export type Briefing = typeof briefings.$inferSelect;
export type NewBriefing = typeof briefings.$inferInsert;
