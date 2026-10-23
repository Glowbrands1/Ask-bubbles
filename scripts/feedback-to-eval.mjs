#!/usr/bin/env node
/**
 * Turn 1–4 star ratings into redacted replay cases.
 *
 * assistant_feedback stores no question and no answer. Join a trace on
 * client_message_id = chat_traces.message_id and pass original_query as
 * `question`. This script reads that join as JSON on stdin and writes
 * cases to stdout. It does not connect to Supabase and it does not write
 * a file, so running it does not commit a rating export.
 *
 * stdin:
 * {
 *   "places": ["Kearney, NE"],
 *   "rows": [{ "rating": 2, "question": "...", "comment": "..." }]
 * }
 */

import { readFileSync } from "node:fs";

import { replayCasesFromFeedback } from "../src/lib/ai/feedback-redact.mjs";

const raw = readFileSync(0, "utf8");
const input = raw.trim() ? JSON.parse(raw) : {};
const cases = replayCasesFromFeedback(input.rows ?? [], input.places ?? []);
process.stdout.write(`${JSON.stringify(cases, null, 2)}\n`);
