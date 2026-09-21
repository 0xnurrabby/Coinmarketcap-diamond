const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

let last = "";
for (let i = 0; i < 60; i++) {
  const r = await fetch(`https://api.render.com/v1/services/${id}/deploys?limit=1`, { headers: h });
  const d = (await r.json())[0]?.deploy;
  if (d.status !== last) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${d.status} (commit ${(d.commit?.id || "").slice(0, 7)})`);
    last = d.status;
  }
  if (["live", "build_failed", "update_failed", "canceled"].includes(d.status)) break;
  await new Promise((r) => setTimeout(r, 15000));
}
