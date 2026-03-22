import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import * as thoughtsTable from "./schema/thoughts";
import * as servicesTable from "./schema/services";
import * as projectsTable from "./schema/projects";
import * as edgesTable from "./schema/edges";

export const tables = {
  ...thoughtsTable,
  ...servicesTable,
  ...projectsTable,
  ...edgesTable,
};

const client = neon(env.DATABASE_URL);
export const db = drizzle(client);
