# Open Brain MCP Server

Local MCP server for your personal knowledge base. Connects to Neon Postgres, generates embeddings via OpenAI, and exposes tools for capture, semantic search, and analysis.

## Setup

```bash
# 1. Create and activate venv (already done if you ran the setup)
cd src/mcp-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Copy env template and fill in your credentials
cp .env.example .env
# Edit .env with your DATABASE_URL and OPENAI_API_KEY

# 3. Register with Claude Code
claude mcp add open-brain \
  -e DATABASE_URL="your-neon-connection-string" \
  -e OPENAI_API_KEY="your-openai-key" \
  -- $(pwd)/.venv/bin/python $(pwd)/server.py
```

## Tools

| Tool | Description |
|------|-------------|
| `capture` | Save a thought with auto-generated embedding and metadata |
| `semantic_search` | Find thoughts by meaning (vector similarity) |
| `search_by_person` | Find thoughts mentioning a specific person |
| `search_by_topic` | Find thoughts tagged with a topic |
| `list_recent` | Browse recently captured thoughts |
| `stats` | View brain statistics and patterns |
| `delete_thought` | Remove a thought by ID |
