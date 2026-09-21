import { execFile } from "node:child_process";
import { appendFileSync, readFileSync, watch } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BRANCH = "main";
const DEBOUNCE_MS = 15_000;
const PUSH_RETRY_MS = 30_000;
const PUSH_RETRIES = 20;

const LOG_FILE = path.join(ROOT, "scripts", "auto-push.log");

const WATCH_DIRS = ["src", "public", "scripts", "cookie-tool/src", "cookie-tool/public"];
const WATCH_FILES = [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "eslint.config.mjs",
  ".env.example",
  ".gitignore",
  ".vercelignore",
  "README.md",
  "DESIGN.md",
  "AGENTS.md",
  "CLAUDE.md",
  "vercel.json",
];

const IGNORE = /(^|[\\/])(\.git|node_modules|\.next|data|\.vercel|dist|portable|auto-push\.log)([\\/]|$)/;

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    /* ignore */
  }
}

function ignored(p) {
  const rel = path.relative(ROOT, p);
  if (rel.startsWith("..")) return true;
  return IGNORE.test(rel);
}

async function git(args) {
  const { stdout } = await exec("git", args, { cwd: ROOT, windowsHide: true });
  return stdout;
}

let timer = null;
let busy = false;
let dirtyWhileBusy = false;

function schedule(reason) {
  log(`change: ${reason} -> committing in ${DEBOUNCE_MS / 1000}s`);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

async function flush() {
  timer = null;
  if (busy) {
    dirtyWhileBusy = true;
    return;
  }
  busy = true;
  try {
    await git(["add", "-A"]);
    const status = await git(["status", "--porcelain"]);
    if (!status.trim()) {
      log("no changes to commit");
      return;
    }

    const msg = `auto: update ${new Date().toISOString().replace("T", " ").slice(0, 19)}`;
    try {
      await git(["commit", "-m", msg]);
      log(`committed: ${msg}`);
    } catch (e) {
      log(`commit failed: ${String(e.stderr || e.message).trim()}`);
      return;
    }

    for (let attempt = 1; attempt <= PUSH_RETRIES; attempt++) {
      try {
        await git(["push", "origin", BRANCH]);
        log(`pushed to origin/${BRANCH}`);
        return;
      } catch (e) {
        const err = String(e.stderr || e.message).trim();
        log(`push attempt ${attempt} failed: ${err.split("\n").slice(-1)[0]}`);
        if (attempt < PUSH_RETRIES) await new Promise((r) => setTimeout(r, PUSH_RETRY_MS));
      }
    }
    log("giving up pushing after retries; will push on next change");
  } finally {
    busy = false;
    if (dirtyWhileBusy) {
      dirtyWhileBusy = false;
      schedule("changes during push");
    }
  }
}

log(`watching ${WATCH_DIRS.length} dirs + ${WATCH_FILES.length} files in ${ROOT}`);

for (const dir of WATCH_DIRS) {
  watch(path.join(ROOT, dir), { recursive: true }, (_event, filename) => {
    const target = filename ? path.join(ROOT, dir, filename) : path.join(ROOT, dir);
    if (ignored(target)) return;
    schedule(path.relative(ROOT, target));
  });
}

for (const file of WATCH_FILES) {
  watch(path.join(ROOT, file), (_event) => schedule(file));
}

process.on("SIGINT", () => {
  log("watcher stopped");
  process.exit(0);
});
