import { pgTable, text, uuid, timestamp, index, numeric, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { thoughts } from "./thoughts";

export const thoughtEdges = pgTable(
  "thought_edges",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fromThoughtId: uuid("from_thought_id")
      .notNull()
      .references(() => thoughts.id, { onDelete: "cascade" }),
    toThoughtId: uuid("to_thought_id")
      .notNull()
      .references(() => thoughts.id, { onDelete: "cascade" }),
    edgeType: text("edge_type").notNull(),
    weight: numeric("weight").notNull().default("1.0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    fromIdx: index("idx_thought_edges_from").on(table.fromThoughtId),
    toIdx: index("idx_thought_edges_to").on(table.toThoughtId),
    typeIdx: index("idx_thought_edges_type").on(table.edgeType),
    uniqueEdge: unique("unique_edge").on(
      table.fromThoughtId,
      table.toThoughtId,
      table.edgeType
    ),
  })
);

export const EDGE_TYPES = [
  "relates_to",
  "blocks",
  "caused_by",
  "inspired_by",
  "contradicts",
  "child_of",
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];
export type ThoughtEdge = typeof thoughtEdges.$inferSelect;
export type NewThoughtEdge = typeof thoughtEdges.$inferInsert;
