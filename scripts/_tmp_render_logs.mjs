const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const ownerId = "tea-daojrurm8hqs73evrcp0";
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

const candidates = [
  `/services/${id}/logs?limit=100`,
  `/logs?ownerId=${ownerId}&resourceId=${id}&limit=100`,
  `/logs?ownerId=${ownerId}&resource=${id}&limit=100`,
  `/services/${id}/builds?limit=5`,
];

for (const path of candidates) {
  const r = await fetch(`https://api.render.com/v1${path}`, { headers: h });
  const t = await r.text();
  console.log(`\n=== ${path} -> ${r.status} ===`);
  console.log(t.slice(0, 3000));
}
