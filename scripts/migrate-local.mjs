import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const { d1 } = JSON.parse(readFileSync(join(projectRoot, ".openai/hosting.json"), "utf8"));
if (!d1) throw new Error("No local D1 binding declared in .openai/hosting.json.");

const runtimeRoot = join(projectRoot, ".sites-runtime");
mkdirSync(runtimeRoot, { recursive: true });
const configPath = join(runtimeRoot, "wrangler.local.json");
writeFileSync(configPath, JSON.stringify({
  name: "distribution-os-local",
  d1_databases: [{
    binding: d1,
    // Must match Vite's local binding so both tools open the same database.
    database_name: "site-creator-d1",
    database_id: "00000000-0000-4000-8000-000000000000",
    migrations_dir: join(projectRoot, "drizzle"),
  }],
}, null, 2));

const result = spawnSync(process.execPath, [
  "node_modules/wrangler/bin/wrangler.js", "d1", "migrations", "apply", d1,
  "--local", "--config", configPath,
  "--persist-to", join(projectRoot, ".wrangler/state"),
], {
  cwd: projectRoot,
  env: { ...process.env, CI: "true", WRANGLER_WRITE_LOGS: "false" },
  stdio: ["ignore", "inherit", "inherit"],
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
