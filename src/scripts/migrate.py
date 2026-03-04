#!/usr/bin/env python3
"""
Memory Migration Script

Imports thoughts from a text file into the Open Brain database.
Each thought should be separated by a blank line.

Usage:
    python migrate.py <input_file> [--source migration]
    python migrate.py memories.txt
    python migrate.py claude_memories.txt --source claude
    echo "A single thought" | python migrate.py -

Input formats supported:
    - Plain text file with thoughts separated by blank lines
    - One thought per line (for single-line thoughts)
    - Stdin (use - as filename)
"""

import argparse
import os
import sys
import time

# Add the MCP server directory to path for shared helpers
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mcp-server"))

from dotenv import load_dotenv

# Load env from the mcp-server directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "mcp-server", ".env"))

import psycopg2
import psycopg2.extras
from openai import OpenAI

DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

openai_client = OpenAI(api_key=OPENAI_API_KEY)

# Import helpers from server
from server import generate_embedding, extract_metadata


def parse_thoughts(text: str) -> list[str]:
    """Split text into individual thoughts, separated by blank lines."""
    # Split by double newline (blank line separator)
    chunks = text.split("\n\n")
    # Clean up and filter empty chunks
    thoughts = []
    for chunk in chunks:
        cleaned = chunk.strip()
        if cleaned and len(cleaned) > 5:  # Skip very short fragments
            thoughts.append(cleaned)
    return thoughts


def migrate_thoughts(thoughts: list[str], source: str = "migration"):
    """Insert thoughts into the database with embeddings and metadata."""
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    conn.autocommit = True

    total = len(thoughts)
    success = 0
    errors = 0

    print(f"Migrating {total} thoughts (source: {source})...")
    print()

    for i, text in enumerate(thoughts, 1):
        preview = text[:80].replace("\n", " ")
        print(f"  [{i}/{total}] {preview}{'...' if len(text) > 80 else ''}")

        try:
            embedding = generate_embedding(text)
            metadata = extract_metadata(text)

            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO thoughts (raw_text, embedding, thought_type, people, topics, action_items, source)
                    VALUES (%s, %s::vector, %s, %s, %s, %s, %s)
                    """,
                    (
                        text,
                        str(embedding),
                        metadata["thought_type"],
                        metadata["people"],
                        metadata["topics"],
                        metadata["action_items"],
                        source,
                    ),
                )

            ttype = metadata["thought_type"].replace("_", " ")
            topics = ", ".join(metadata["topics"][:3]) if metadata["topics"] else "none"
            print(f"         → {ttype} | topics: {topics}")
            success += 1

        except Exception as e:
            print(f"         → ERROR: {e}")
            errors += 1

        # Brief pause to avoid rate limits
        if i % 10 == 0:
            time.sleep(0.5)

    conn.close()

    print()
    print(f"Migration complete: {success} imported, {errors} errors, {total} total.")


def main():
    parser = argparse.ArgumentParser(description="Import thoughts into Open Brain")
    parser.add_argument(
        "input_file",
        help="Path to text file with thoughts (use - for stdin)",
    )
    parser.add_argument(
        "--source",
        default="migration",
        help="Source label for imported thoughts (default: migration)",
    )
    args = parser.parse_args()

    if args.input_file == "-":
        text = sys.stdin.read()
    else:
        with open(args.input_file) as f:
            text = f.read()

    thoughts = parse_thoughts(text)

    if not thoughts:
        print("No thoughts found in input. Expected thoughts separated by blank lines.")
        sys.exit(1)

    print(f"Found {len(thoughts)} thoughts to migrate.")
    print()

    # Show preview
    for i, t in enumerate(thoughts[:3], 1):
        preview = t[:100].replace("\n", " ")
        print(f"  Preview {i}: {preview}{'...' if len(t) > 100 else ''}")

    if len(thoughts) > 3:
        print(f"  ... and {len(thoughts) - 3} more")

    print()
    response = input("Proceed with migration? [y/N] ")
    if response.lower() != "y":
        print("Cancelled.")
        sys.exit(0)

    migrate_thoughts(thoughts, source=args.source)


if __name__ == "__main__":
    main()
