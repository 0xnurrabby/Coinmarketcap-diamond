const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

const r = await fetch(`https://api.render.com/v1/services/${id}/env-vars?limit=50`, { headers: h });
const vars = await r.json();
for (const item of vars) {
  const e = item.envVar;
  if (e.key === "DATABASE_URL") {
    console.log("Render DATABASE_URL host:", e.value.split("@")[1]?.split("/")[0]);
  }
}
