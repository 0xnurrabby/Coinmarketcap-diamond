/**
 * DiamondClaim Cookie Tool — portable Windows EXE
 * Uses system Chrome/Edge via CDP (no Playwright bundle).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");
const WebSocket = require("ws");

const PORT = 17865;
const DEBUG_PORT = 19222;
const DATA_DIR = path.join(
  process.env.LOCALAPPDATA || process.env.HOME || process.cwd(),
  "DiamondClaimCookieTool"
);
const COOKIES_DIR = path.join(DATA_DIR, "cookies");
const PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");

function ensureDirs() {
  fs.mkdirSync(COOKIES_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

function log(...args) {
  console.log(...args);
}

function findBrowser() {
  const candidates = [
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
    process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Google\\Chrome\\Application\\chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(process.env["PROGRAMFILES(X86)"], "Google\\Chrome\\Application\\chrome.exe"),
    process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Microsoft\\Edge\\Application\\msedge.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(process.env["PROGRAMFILES(X86)"], "Microsoft\\Edge\\Application\\msedge.exe"),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Microsoft\\Edge\\Application\\msedge.exe"),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* */
    }
  }
  return null;
}

function safeName(name) {
  return String(name || "account")
    .replace(/[^\w.\-@]+/g, "_")
    .slice(0, 80);
}

function cookiePath(name) {
  return path.join(COOKIES_DIR, `${safeName(name)}.json`);
}

function listSaved() {
  ensureDirs();
  return fs
    .readdirSync(COOKIES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const full = path.join(COOKIES_DIR, f);
      try {
        const raw = JSON.parse(fs.readFileSync(full, "utf8"));
        return {
          file: f,
          name: raw.name || f.replace(/\.json$/, ""),
          cookieCount: (raw.cookies || []).length,
          savedAt: raw.savedAt || null,
          expiresAt: raw.expiresAt || null,
          path: full,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
}

/** @type {Map<string, { key: string, name: string, proc: import('child_process').ChildProcess|null, cookieCount: number }>} */
const live = new Map();

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Invalid JSON from Chrome debug port"));
          }
        });
      })
      .on("error", reject);
  });
}

function cdpCall(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* */
      }
      reject(new Error("CDP timeout"));
    }, 20000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(String(buf));
        if (msg.id === id) {
          clearTimeout(timer);
          ws.close();
          if (msg.error) reject(new Error(msg.error.message || "CDP error"));
          else resolve(msg.result || {});
        }
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function waitForDebugPort(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const list = await httpGetJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (Array.isArray(list) && list.length) return list;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Chrome debug port not ready. Close other Chrome windows using profile and try again.");
}

async function getCmcCookies() {
  const list = await waitForDebugPort(5);
  // Prefer a coinmarketcap page
  let target =
    list.find(
      (t) =>
        t.type === "page" &&
        t.url &&
        String(t.url).includes("coinmarketcap.com") &&
        t.webSocketDebuggerUrl
    ) ||
    list.find((t) => t.type === "page" && t.webSocketDebuggerUrl) ||
    list.find((t) => t.webSocketDebuggerUrl);

  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No browser page found. Keep the Chrome window open.");
  }

  const result = await cdpCall(target.webSocketDebuggerUrl, "Network.getAllCookies");
  const cookies = (result.cookies || []).filter(
    (c) =>
      String(c.domain || "").includes("coinmarketcap.com") ||
      String(c.domain || "").includes("cmc.com")
  );
  return cookies;
}

async function openLogin(name) {
  const key = safeName(name) || `acc_${Date.now()}`;
  if (live.has(key)) {
    const old = live.get(key);
    try {
      old.proc?.kill();
    } catch {
      /* */
    }
    live.delete(key);
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error(
      "Chrome or Edge not found.\nInstall Google Chrome or Microsoft Edge, then try again."
    );
  }

  ensureDirs();
  const userDataDir = path.join(PROFILE_DIR, key);
  fs.mkdirSync(userDataDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--window-size=1280,900",
    "https://coinmarketcap.com/",
  ];

  const proc = spawn(browserPath, args, {
    detached: true,
    stdio: "ignore",
  });
  proc.unref();

  // wait until debug port is up
  await waitForDebugPort(40);

  const session = {
    key,
    name: name || key,
    proc,
    cookieCount: 0,
  };

  const tick = async () => {
    try {
      const cookies = await getCmcCookies();
      session.cookieCount = cookies.length;
    } catch {
      /* not ready */
    }
  };
  await tick();
  const timer = setInterval(tick, 2000);
  session.timer = timer;

  live.set(key, session);
  return { key, cookieCount: session.cookieCount };
}

async function capture(key) {
  const session = live.get(key);
  if (!session) throw new Error("No live browser. Click Login first.");

  const cookies = await getCmcCookies();
  if (cookies.length < 3) {
    throw new Error(
      "Not enough cookies yet. Finish login (2FA/captcha), then Capture again."
    );
  }

  const far = Math.floor(Date.now() / 1000) + 150 * 24 * 60 * 60;
  const normalized = cookies.map((c) => {
    const exp =
      !c.expires || c.expires < 0 || c.expires < far - 30 * 24 * 60 * 60
        ? far
        : Math.floor(c.expires);
    return {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || "/",
      expires: exp,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: c.sameSite || "Lax",
    };
  });

  ensureDirs();
  const payload = {
    name: session.name,
    savedAt: new Date().toISOString(),
    expiresAt: new Date(far * 1000).toISOString(),
    note: "CMC may invalidate earlier. Re-capture if claims fail.",
    cookies: normalized,
  };
  const out = cookiePath(session.name);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2), "utf8");

  try {
    if (session.timer) clearInterval(session.timer);
    session.proc?.kill();
  } catch {
    /* */
  }
  live.delete(key);

  return {
    file: out,
    cookieCount: normalized.length,
    expiresAt: payload.expiresAt,
    cookiesJson: JSON.stringify(normalized),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function send(res, code, obj) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(obj));
}

function resolvePublicIndex() {
  const candidates = [];
  if (process.pkg) {
    candidates.push(path.join(path.dirname(process.execPath), "public", "index.html"));
    candidates.push(path.join(__dirname, "public", "index.html"));
    candidates.push(path.join(__dirname, "..", "public", "index.html"));
  } else {
    candidates.push(path.join(__dirname, "..", "public", "index.html"));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function extractPublicNextToExe() {
  if (!process.pkg) return;
  try {
    const destDir = path.join(path.dirname(process.execPath), "public");
    const dest = path.join(destDir, "index.html");
    if (fs.existsSync(dest)) return;
    // read from snapshot
    const snap = path.join(__dirname, "..", "public", "index.html");
    if (fs.existsSync(snap)) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(snap, dest);
    }
  } catch (e) {
    log("public extract skip:", e.message);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const index = resolvePublicIndex();
      if (!index) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("UI file missing (public/index.html). Keep public folder next to the EXE.");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(index));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/list") {
      return send(res, 200, { accounts: listSaved(), dataDir: DATA_DIR });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/live/")) {
      const key = decodeURIComponent(url.pathname.replace("/api/live/", ""));
      const s = live.get(key);
      return send(res, 200, {
        live: Boolean(s),
        cookieCount: s?.cookieCount || 0,
        name: s?.name || key,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) return send(res, 400, { error: "Account name required" });
      const info = await openLogin(name);
      return send(res, 200, { ok: true, ...info });
    }

    if (req.method === "POST" && url.pathname === "/api/capture") {
      const body = await readBody(req);
      const key = String(body.key || "").trim();
      if (!key) return send(res, 400, { error: "key required" });
      const result = await capture(key);
      return send(res, 200, { ok: true, ...result });
    }

    if (req.method === "POST" && url.pathname === "/api/cancel") {
      const body = await readBody(req);
      const key = String(body.key || "").trim();
      const s = live.get(key);
      if (s) {
        try {
          if (s.timer) clearInterval(s.timer);
          s.proc?.kill();
        } catch {
          /* */
        }
        live.delete(key);
      }
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/export/")) {
      const file = decodeURIComponent(url.pathname.replace("/api/export/", ""));
      const full = path.join(COOKIES_DIR, path.basename(file));
      if (!fs.existsSync(full)) return send(res, 404, { error: "Not found" });
      const raw = JSON.parse(fs.readFileSync(full, "utf8"));
      return send(res, 200, {
        name: raw.name,
        cookiesJson: JSON.stringify(raw.cookies || []),
        expiresAt: raw.expiresAt,
        savedAt: raw.savedAt,
      });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/export/")) {
      const file = decodeURIComponent(url.pathname.replace("/api/export/", ""));
      const full = path.join(COOKIES_DIR, path.basename(file));
      if (fs.existsSync(full)) fs.unlinkSync(full);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/upload") {
      const body = await readBody(req);
      const apiBase = String(body.apiBase || "").replace(/\/$/, "");
      const sitePassword = String(body.sitePassword || "");
      const email = String(body.email || "");
      const password = String(body.password || "");
      const accountName = String(body.accountName || "");
      const cookiesJson = String(body.cookiesJson || "");

      if (!apiBase || !accountName || !cookiesJson) {
        return send(res, 400, { error: "apiBase, accountName, cookiesJson required" });
      }

      function mergeSetCookie(existing, res) {
        const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
        const parts = set.map((c) => c.split(";")[0]);
        return [existing, ...parts].filter(Boolean).join("; ");
      }

      let jar = "";
      const gate = await fetch(`${apiBase}/api/site-gate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: sitePassword }),
      });
      jar = mergeSetCookie(jar, gate);
      if (!gate.ok) {
        const g = await gate.json().catch(() => ({}));
        return send(res, 400, { error: g.error || "Site password failed" });
      }

      const login = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: jar },
        body: JSON.stringify({ email, password }),
      });
      jar = mergeSetCookie(jar, login);
      if (!login.ok) {
        const l = await login.json().catch(() => ({}));
        return send(res, 400, { error: l.error || "Dashboard login failed" });
      }

      const listRes = await fetch(`${apiBase}/api/accounts`, {
        headers: { cookie: jar },
      });
      const listData = await listRes.json();
      let acc = (listData.accounts || []).find((a) => a.name === accountName);
      if (!acc) {
        const created = await fetch(`${apiBase}/api/accounts`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: jar },
          body: JSON.stringify({ name: accountName, cookies: cookiesJson }),
        });
        const cdata = await created.json();
        if (!created.ok) return send(res, 400, { error: cdata.error || "Create failed" });
        return send(res, 200, { ok: true, account: cdata.account });
      }

      const patched = await fetch(`${apiBase}/api/accounts/${acc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: jar },
        body: JSON.stringify({ cookies: cookiesJson }),
      });
      const pdata = await patched.json();
      if (!patched.ok) return send(res, 400, { error: pdata.error || "Update failed" });
      return send(res, 200, { ok: true, account: pdata.account });
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

function openAppWindow(url) {
  // Open as desktop-style app window (not a normal browser tab)
  const edge =
    (process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Microsoft\\Edge\\Application\\msedge.exe")) ||
    "";
  const edge86 =
    (process.env["PROGRAMFILES(X86)"] &&
      path.join(
        process.env["PROGRAMFILES(X86)"],
        "Microsoft\\Edge\\Application\\msedge.exe"
      )) ||
    "";
  const chrome =
    (process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Google\\Chrome\\Application\\chrome.exe"
      )) ||
    "";
  const chromePf =
    (process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Google\\Chrome\\Application\\chrome.exe")) ||
    "";

  const browsers = [edge, edge86, chrome, chromePf].filter((p) => p && fs.existsSync(p));
  if (browsers[0]) {
    spawn(
      browsers[0],
      [
        `--app=${url}`,
        "--window-size=460,620",
        "--window-position=200,80",
        "--disable-extensions",
      ],
      { detached: true, stdio: "ignore" }
    ).unref();
    return;
  }
  // fallback
  exec(`cmd /c start "" "${url}"`, () => {});
}

function pauseOnError(err) {
  console.error("\nFATAL:", err && err.stack ? err.stack : err);
  console.error("\nPress Enter to close...");
  try {
    require("readline")
      .createInterface({ input: process.stdin, output: process.stdout })
      .question("", () => process.exit(1));
  } catch {
    setTimeout(() => process.exit(1), 15000);
  }
}

process.on("uncaughtException", pauseOnError);
process.on("unhandledRejection", pauseOnError);

try {
  ensureDirs();
  extractPublicNextToExe();

  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${PORT}`;
    log("");
    log("  DiamondClaim Cookie Tool");
    log("  ------------------------");
    log("  Open: " + url);
    log("  Cookies: " + COOKIES_DIR);
    log("  Keep this black window open while using the tool.");
    log("  Close window to stop.");
    log("");
    openAppWindow(url);
  });

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      log("Port in use — opening existing app window...");
      openAppWindow(`http://127.0.0.1:${PORT}`);
      return;
    }
    pauseOnError(err);
  });
} catch (e) {
  pauseOnError(e);
}
