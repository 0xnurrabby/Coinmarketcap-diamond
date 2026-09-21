const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const ownerId = "tea-daojrurm8hqs73evrcp0";
const h = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const svc = await fetch(`https://api.render.com/v1/services/${id}`, { headers: h });
const s = await svc.json();
console.log("current build command:", s.serviceDetails?.envSpecificDetails?.buildCommand);

const dep = await fetch(`https://api.render.com/v1/services/${id}/deploys`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ clearCache: "clear" }),
});
console.log("triggered:", dep.status);
await dep.text();

await new Promise((r) => setTimeout(r, 5000));
const listRes = await fetch(`https://api.render.com/v1/services/${id}/deploys?limit=1`, { headers: h });
const list = await listRes.json();
const deployId = (list[0]?.deploy || list[0]).id;
console.log("watching deploy:", deployId);

const strip = (s) =>
  String(s)
    .replace(/\u001b\[[0-9;()B]*[a-zA-Z]/g, "")
    .replace(/\u001b\(B/g, "")
    .trimEnd();

let printed = 0;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const dr = await fetch(`https://api.render.com/v1/services/${id}/deploys/${deployId}`, { headers: h });
  const d = await dr.json();
  const lr = await fetch(
    `https://api.render.com/v1/logs?ownerId=${ownerId}&resource=${id}&limit=120&direction=backward`,
    { headers: h }
  );
  const logs = ((await lr.json()).logs || []).slice().reverse().map((l) => strip(l.message));
  if (logs.length > printed) {
    for (const line of logs.slice(printed)) {
      if (line.trim()) console.log(line);
    }
    printed = logs.length;
  }
  if (["live", "build_failed", "update_failed", "canceled"].includes(d.status)) {
    console.log(`\n>>> deploy ${d.status}`);
    break;
  }
}
