const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

const r = await fetch(`https://api.render.com/v1/services/${id}/env-vars?limit=50`, {
  headers: h,
});
const t = await r.text();
console.log("env-vars status:", r.status);
const data = JSON.parse(t);
for (const item of data) {
  const e = item.envVar;
  const value = e.value ? `${e.value.slice(0, 24)}...` : "(empty)";
  console.log(`- ${e.key} = ${value}`);
}

const svc = await fetch(`https://api.render.com/v1/services/${id}`, { headers: h });
const s = (await svc.json()).serviceDetails || (await svc.json());
console.log("\nbuild:", JSON.stringify(s.envSpecificDetails || s.serviceDetails?.envSpecificDetails));
