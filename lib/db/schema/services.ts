import { pgTable, text, uuid, timestamp, index, numeric } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const services = pgTable(
  "services",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    category: text("category").notNull(),
    billingModel: text("billing_model").notNull(),
    monthlyCost: numeric("monthly_cost"),
    projects: text("projects")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    categoryIdx: index("idx_services_category").on(table.category),
    statusIdx: index("idx_services_status").on(table.status),
  })
);

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
