/**
 * One-time import of Nadeko quote export into the quotes table.
 *
 * Run from the boop-site directory (picks up .env automatically):
 *   bun run ../scripts/import-quotes.ts /path/to/quote-export.yml
 *
 * Install js-yaml first if not present: bun add js-yaml @types/js-yaml
 */

import sql from "../boop-site/src/lib/db.ts";
import { load as yamlLoad } from "js-yaml";
import { readFileSync } from "fs";
import { resolve } from "path";

const ymlPath = process.argv[2];
if (!ymlPath) { console.error("Usage: bun run import-quotes.ts <path-to-quote-export.yml>"); process.exit(1); }

type NadekoQuote = { id: string; an: string; aid: string | number; txt: string };
type NadekoExport = Record<string, NadekoQuote[]>;

const raw = readFileSync(resolve(ymlPath), "utf8");
const data = yamlLoad(raw) as NadekoExport;

let inserted = 0;
let skipped = 0;

for (const [keyword, quotes] of Object.entries(data)) {
  if (!Array.isArray(quotes)) continue;

  for (const q of quotes) {
    const nadekoId  = String(q.id  ?? "").trim();
    const authorId  = String(q.aid ?? "").trim();
    const authorName = String(q.an ?? "").trim();
    const text      = String(q.txt ?? "").trim();

    if (!text) { skipped++; continue; }

    try {
      await sql`
        INSERT INTO quotes (keyword, nadeko_id, author_name, author_discord_id, text)
        VALUES (${keyword}, ${nadekoId || null}, ${authorName || null}, ${authorId || null}, ${text})
        ON CONFLICT (nadeko_id) DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.error(`  Failed: keyword=${keyword} id=${nadekoId}`, err);
      skipped++;
    }
  }
}

await sql.end();
console.log(`Done. Inserted: ${inserted}  Skipped/errors: ${skipped}`);
