import OpenAI from "openai";
import { env } from "@/lib/env";

const EXTRACTION_MODEL = "gpt-4o-mini";

const VALID_TYPES = [
  "decision",
  "insight",
  "meeting",
  "person_note",
  "idea",
  "action_item",
  "reflection",
  "reference",
  "milestone",
] as const;

export type ThoughtType = (typeof VALID_TYPES)[number];

export interface ThoughtMetadata {
  thought_type: ThoughtType;
  people: string[];
  topics: string[];
  action_items: string[];
}

const SYSTEM_PROMPT = `You are a metadata extraction assistant. Given a thought or note, extract structured metadata.

Respond with ONLY valid JSON matching this schema:
{
  "thought_type": one of ["decision", "insight", "meeting", "person_note", "idea", "action_item", "reflection", "reference", "milestone"],
  "people": [list of people mentioned by name, empty array if none],
  "topics": [2-5 topic keywords that capture the subject matter],
  "action_items": [list of action items if any, empty array if none]
}

Guidelines:
- "decision": the person made or is considering a choice
- "insight": a realization, observation, or learned lesson
- "meeting": notes from a conversation or meeting
- "person_note": information about a specific person
- "idea": a concept, proposal, or creative thought
- "action_item": a task or todo — something that needs to be DONE. Do NOT use this for summaries of completed work
- "reflection": personal thinking, journaling, self-assessment
- "reference": factual information, links, resources to remember
- "milestone": a session summary, project accomplishment, shipped feature, or win. Use this for recaps of what was built/achieved/completed — NOT for tasks that still need doing
- Extract ONLY names that are clearly people (not companies, products, etc.)
- Topics should be 1-3 word phrases, lowercase`;

let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

export async function extractMetadata(text: string): Promise<ThoughtMetadata> {
  const response = await getClient().chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const result = JSON.parse(response.choices[0].message.content!);

  // Validate and sanitize
  const thoughtType = VALID_TYPES.includes(result.thought_type)
    ? result.thought_type
    : "reflection";

  return {
    thought_type: thoughtType,
    people: result.people ?? [],
    topics: result.topics ?? [],
    action_items: result.action_items ?? [],
  };
}
