const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

async function api(path) {
  const r = await fetch(`https://api.render.com/v1${path}`, { headers: h });
  const t = await r.text();
  try {
    return { status: r.status, json: JSON.parse(t) };
  } catch {
    return { status: r.status, json: null, text: t.slice(0, 400) };
  }
}

const deploys = await api(`/services/${id}/deploys?limit=5`);
console.log("=== deploys ===");
for (const item of deploys.json || []) {
  const d = item.deploy || item;
  console.log(
    `- ${d.id} | status=${d.status} | created=${d.createdAt} | finished=${d.finishedAt} | commit=${(d.commit?.id || "").slice(0, 8)} ${d.commit?.message?.split("\n")[0] || ""}`
  );
}

const events = await api(`/services/${id}/events?limit=40`);
console.log("\n=== events ===");
for (const item of events.json || []) {
  const e = item.event || item;
  const details = e.details
    ? JSON.stringify(e.details).slice(0, 400)
    : "";
  console.log(`- ${e.timestamp} | ${e.type} | ${details}`);
}
