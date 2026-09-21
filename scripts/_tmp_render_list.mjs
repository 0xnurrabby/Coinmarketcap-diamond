const key = process.env.RENDER_API_KEY;
const h = { Authorization: `Bearer ${key}`, Accept: "application/json" };

async function api(path) {
  const r = await fetch(`https://api.render.com/v1${path}`, { headers: h });
  const t = await r.text();
  try {
    return { status: r.status, json: JSON.parse(t) };
  } catch {
    return { status: r.status, json: null, text: t.slice(0, 300) };
  }
}

const services = await api("/services?limit=50");
console.log("services:", services.status);
for (const item of services.json || []) {
  const s = item.service;
  console.log(
    `- ${s.name} | id=${s.id} | type=${s.type} | plan=${s.serviceDetails?.plan} | repo=${s.repo} | branch=${s.branch} | autoDeploy=${s.autoDeploy} | url=${s.serviceDetails?.url} | suspended=${s.suspended}`
  );
}
