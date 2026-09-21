const key = process.env.RENDER_API_KEY;
const ownerId = "tea-daojrurm8hqs73evrcp0";
const candidates = [
  "/v1/github/installations",
  "/v1/repos",
  `/v1/repos?ownerId=${ownerId}`,
  `/v1/owners/${ownerId}/repos`,
  "/v1/git-credentials",
  "/v1/services?limit=20",
];

for (const path of candidates) {
  try {
    const r = await fetch(`https://api.render.com${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    const t = await r.text();
    console.log(`${path} -> ${r.status} ${t.slice(0, 220).replace(/\n/g, " ")}`);
  } catch (e) {
    console.log(`${path} -> ERR ${e.message}`);
  }
}
