const base = "https://coinmarketcap-diamond.onrender.com";

async function get(path, opts = {}) {
  const t = Date.now();
  try {
    const r = await fetch(base + path, { ...opts, redirect: "manual" });
    const text = await r.text();
    console.log(
      `${opts.method || "GET"} ${path} -> ${r.status} in ${((Date.now() - t) / 1000).toFixed(1)}s | ${text.slice(0, 140).replace(/\n/g, " ")}`
    );
    return { status: r.status, text, headers: r.headers };
  } catch (e) {
    console.log(`${path} -> ERR ${e.message}`);
    return { status: 0 };
  }
}

await get("/gate");
await get("/");
await get("/api/cron/claim?secret=dcr_uyurt7encjts13g26a");
await get("/api/cron/claim?secret=wrong");
await get("/api/auth/me");
