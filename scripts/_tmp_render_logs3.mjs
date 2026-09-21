const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const ownerId = "tea-daojrurm8hqs73evrcp0";
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

const strip = (s) =>
  String(s)
    .replace(/\u001b\[[0-9;()B]*[a-zA-Z]/g, "")
    .replace(/\u001b\(B/g, "")
    .trimEnd();

const r = await fetch(
  `https://api.render.com/v1/logs?ownerId=${ownerId}&resource=${id}&limit=300&direction=backward`,
  { headers: h }
);
const logs = (await r.json()).logs || [];
const lines = logs
  .slice()
  .reverse()
  .map((l) => `${l.timestamp.slice(11, 19)} ${strip(l.message)}`)
  .filter((l) => l.trim().length > 12);

console.log("=== lines mentioning chromium/browser/build ===");
for (const l of lines) {
  if (/chromium|chrome|playwright|Build|build|Downloading|installed/i.test(l)) {
    console.log(l);
  }
}
console.log("\n=== last 15 lines ===");
console.log(lines.slice(-15).join("\n"));
