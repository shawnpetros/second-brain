import OpenAI from "openai";
import { env } from "@/lib/env";

const EMBEDDING_MODEL = "text-embedding-3-small";

let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}
