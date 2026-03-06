import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import "dotenv/config";

/**
 * Split a SQL file into individual statements, respecting $$ blocks
 * (PL/pgSQL functions, DO blocks) that contain semicolons.
 */
function splitStatements(content: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarBlock = false;

  for (let i = 0; i < content.length; i++) {
    // Check for $$ delimiter
    if (content[i] === "$" && content[i + 1] === "$") {
      current += "$$";
      i++; // skip second $
      inDollarBlock = !inDollarBlock;
      continue;
    }

    // Statement boundary (semicolon outside $$ block)
    if (content[i] === ";" && !inDollarBlock) {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += content[i];
  }

  // Catch any trailing statement without a semicolon
  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements;
}

/**
 * Simple SQL migration runner.
 *
 * Reads numbered .sql files from src/migrations/ and applies them in order.
 * Tracks applied migrations in a `schema_migrations` table so each file
 * runs at most once. Safe to re-run on every deploy.
 */
const runMigrate = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
  }

  const sql = neon(process.env.DATABASE_URL);

  // Ensure tracking table exists
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Get already-applied migrations
  const applied = await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  const appliedSet = new Set(applied.map((r) => r.filename));

  // Read migration files in order
  const migrationsDir = join(process.cwd(), "src", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  skip: ${file} (already applied)`);
      continue;
    }

    const content = readFileSync(join(migrationsDir, file), "utf-8");
    const statements = splitStatements(content);
    console.log(`  apply: ${file} (${statements.length} statement(s))`);

    for (const stmt of statements) {
      await sql(stmt);
    }

    await sql`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    ran++;
  }

  if (ran === 0) {
    console.log("No pending migrations.");
  } else {
    console.log(`Applied ${ran} migration(s).`);
  }
};

const start = Date.now();
console.log("Running migrations...");

runMigrate()
  .then(() => {
    console.log(`Done in ${Date.now() - start}ms`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
