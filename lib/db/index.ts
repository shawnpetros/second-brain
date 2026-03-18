import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import * as thoughtsTable from "./schema/thoughts";
import * as servicesTable from "./schema/services";

export const tables = {
  ...thoughtsTable,
  ...servicesTable,
};

const client = neon(env.DATABASE_URL);
export const db = drizzle(client);
