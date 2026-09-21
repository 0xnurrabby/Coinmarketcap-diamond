const key = process.env.RENDER_API_KEY;
const r = await fetch("https://api.render.com/v1/openapi.json", {
  headers: { Authorization: `Bearer ${key}` },
});
console.log("spec status:", r.status);
if (!r.ok) process.exit(1);
const text = await r.text();
const paths = [...new Set([...text.matchAll(/"(\/v1\/[^"]*)"/g)].map((m) => m[1]))];
const gitPaths = paths.filter((p) => /github|repo|git/i.test(p));
console.log("git-related endpoints:");
console.log(gitPaths.join("\n"));
console.log("\nall endpoints count:", paths.length);
console.log(paths.slice(0, 60).join("\n"));
