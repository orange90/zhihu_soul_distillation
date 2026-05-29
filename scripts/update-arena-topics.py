#!/usr/bin/env python3
"""
Called by .github/workflows/update-arena-topics.yml.
Reads /tmp/arena-response.json (fetched from production API),
injects today's date, and writes public/arena-topics.json.
"""
import json
import os
import sys

today = os.environ.get("TODAY", "")
if not today:
    print("ERROR: TODAY env var is not set", file=sys.stderr)
    sys.exit(1)

try:
    with open("/tmp/arena-response.json") as f:
        data = json.load(f)
except Exception as e:
    print(f"ERROR: could not read /tmp/arena-response.json: {e}", file=sys.stderr)
    sys.exit(1)

data["date"] = today

topics = data.get("topics", [])
if not topics:
    print("No topics returned — skipping write", file=sys.stderr)
    sys.exit(1)

print(f"Got {len(topics)} topics for {today}")

out_path = os.path.join(os.path.dirname(__file__), "..", "public", "arena-topics.json")
with open(out_path, "w", encoding="utf-8") as out:
    json.dump(data, out, ensure_ascii=False, indent=2)
    out.write("\n")

print(f"Written to public/arena-topics.json")
