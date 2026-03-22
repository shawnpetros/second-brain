import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";
import "dotenv/config";

/**
 * One-time backfill: extract deadlines from existing action_item thoughts.
 * Run: npx tsx scripts/backfill-deadlines.ts
 */

const sql = neon(process.env.DATABASE_URL!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEADLINE_PROMPT = `You extract deadlines from text. Today is ${new Date().toISOString().slice(0, 10)}.

Given a task description, return ONLY a JSON object:
{"deadline": "YYYY-MM-DD"} if a deadline is mentioned or implied (e.g., "by Tuesday", "due March 25", "this week", "before the interview on Tuesday")
{"deadline": null} if no deadline is mentioned

Convert relative dates to absolute dates using today's date. Be conservative — only extract dates that clearly indicate a due date, not just any date mentioned.`;

async function main() {
  // Get all action_item thoughts without a deadline set
  const tasks = await sql`
    SELECT id, raw_text FROM thoughts
    WHERE thought_type = 'action_item'
      AND status IN ('untriaged', 'active')
      AND deadline IS NULL
    ORDER BY created_at DESC
  `;

  console.log(`Found ${tasks.length} action items without deadlines`);

  let updated = 0;
  for (const task of tasks) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: DEADLINE_PROMPT },
          { role: "user", content: (task.raw_text as string).slice(0, 500) },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 50,
      });

      const result = JSON.parse(response.choices[0].message.content!);

      if (result.deadline) {
        await sql`UPDATE thoughts SET deadline = ${result.deadline} WHERE id = ${task.id}`;
        console.log(`  ✓ ${(task.raw_text as string).slice(0, 60)}... → ${result.deadline}`);
        updated++;
      } else {
        console.log(`  - ${(task.raw_text as string).slice(0, 60)}... → no deadline`);
      }
    } catch (err) {
      console.error(`  ✗ Error on ${task.id}:`, err);
    }
  }

  console.log(`\nDone. Updated ${updated}/${tasks.length} thoughts with deadlines.`);
}

main().catch(console.error);
