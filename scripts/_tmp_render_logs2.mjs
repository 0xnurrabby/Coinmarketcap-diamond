const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const ownerId = "tea-daojrurm8hqs73evrcp0";
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

const r = await fetch(
  `https://api.render.com/v1/logs?ownerId=${ownerId}&resource=${id}&limit=400&direction=backward`,
  { headers: h }
);
const data = await r.json();
const logs = (data.logs || []).slice().reverse();

const strip = (s) =>
  String(s)
    .replace(/\u001b\[[0-9;()B]*[a-zA-Z]/g, "")
    .replace(/\u001b\(B/g, "")
    .trimEnd();

for (const l of logs) {
  const msg = strip(l.message);
  if (!msg) continue;
  console.log(`${l.timestamp.slice(11, 19)} ${msg}`);
}
