const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const ownerId = "tea-daojrurm8hqs73evrcp0";
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

const strip = (s) =>
  String(s)
    .replace(/\u001b\[[0-9;()B]*[a-zA-Z]/g, "")
    .replace(/\u001b\(B/g, "")
    .trimEnd();

async function latest() {
  const r = await fetch(`https://api.render.com/v1/services/${id}/deploys?limit=1`, { headers: h });
  const d = await r.json();
  return d[0]?.deploy || d[0];
}

let last = "";
for (let i = 0; i < 60; i++) {
  const d = await latest();
  if (d.status !== last) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${d.id} -> ${d.status}`);
    last = d.status;
  }
  if (["live", "build_failed", "update_failed", "canceled", "pre_deploy_failed"].includes(d.status)) {
    if (d.status !== "live") {
      const lr = await fetch(
        `https://api.render.com/v1/logs?ownerId=${ownerId}&resource=${id}&limit=80&direction=backward`,
        { headers: h }
      );
      const logs = (await lr.json()).logs || [];
      console.log("\n--- logs ---");
      for (const l of logs.slice().reverse()) {
        const m = strip(l.message);
        if (m) console.log(`${l.timestamp.slice(11, 19)} ${m}`);
      }
    }
    break;
  }
  await new Promise((r) => setTimeout(r, 20000));
}
