// Renders the home-network report. Reads upstream's data files, never modifies them.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const a = Object.fromEntries(
  process.argv.slice(2).reduce((r, v, i, all) => (v.startsWith("--") ? [...r, [v.slice(2), all[i + 1]]] : r), [])
);
for (const k of ["local", "github", "resources", "readme", "out-reports", "out-readme", "repo", "upstream-sha"]) {
  if (!a[k]) throw new Error(`missing --${k}`);
}
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const [loc, gh, res] = await Promise.all([json(a.local), json(a.github), json(a.resources)]);

const names = new Map(res.resources.map((r) => [r.id, r.name]));
const ghById = new Map(gh.results.map((r) => [r.resource_id, r]));
const icon = { reachable: "🟢", restricted: "🟡", unreachable: "🔴" };
const count = (rs, s) => rs.filter((r) => r.status === s).length;
const rows = loc.results.map((r) => {
  const g = ghById.get(r.resource_id);
  return { id: r.resource_id, name: names.get(r.resource_id) ?? r.resource_id, url: r.url, l: r, g, diff: !!g && g.status !== r.status };
});
const diffs = rows.filter((r) => r.diff);
const when = loc.generated_at;
const pad = (r) => (r ? `${icon[r.status] ?? "⚪"} ${r.http_status ?? r.error ?? "-"}` : "-");

const summary = ["reachable", "restricted", "unreachable"]
  .map((s) => `${icon[s]} ${s}: **${count(loc.results, s)}** (GitHub: ${count(gh.results, s)})`)
  .join(" · ");

const tableRows = (list) =>
  list.map((r) => `| [${r.name}](<${r.url}>) | ${pad(r.l)} | ${r.l.response_ms} ms | ${pad(r.g)} | ${r.g ? r.g.response_ms + " ms" : "-"} |`).join("\n");
const head = "| Resource | Home (NZ) | Time | GitHub runner | Time |\n|---|---|---|---|---|";

const report = `# Home-network availability report

Checked from a home connection (NZ, \`Pacific/Auckland\`) at **${when}** using upstream's own
\`scripts/check-availability.mjs\` (upstream commit \`${a["upstream-sha"]}\`, unmodified).
"GitHub runner" columns are upstream's last published result (GitHub-hosted runner).

${summary}

## Differs from the GitHub runner (${diffs.length})

${diffs.length ? `${head}\n${tableRows(diffs)}` : "_No differences._"}

## All resources (${rows.length})

${head}
${tableRows(rows)}
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const trs = (list) =>
  list.map((r) => `<tr class="${r.diff ? "d" : ""}"><td><a href="${esc(r.url)}">${esc(r.name)}</a></td><td>${esc(pad(r.l))}</td><td>${r.l.response_ms} ms</td><td>${esc(pad(r.g))}</td><td>${r.g ? r.g.response_ms + " ms" : "-"}</td></tr>`).join("");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Home-network availability</title>
<style>:root{color-scheme:light dark}body{font:15px system-ui;margin:0 auto;max-width:960px;padding:16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #8884;padding:4px 8px;text-align:left}tr.d{background:#f5a62333}</style>
<h1>Home-network availability</h1><p>Checked ${esc(when)} from home (NZ). Upstream commit <code>${esc(a["upstream-sha"])}</code>. Highlighted rows differ from the GitHub runner.</p>
<p>${esc(summary.replaceAll("**", ""))}</p>
<table><thead><tr><th>Resource</th><th>Home (NZ)</th><th>Time</th><th>GitHub runner</th><th>Time</th></tr></thead><tbody>${trs(diffs)}${trs(rows.filter((r) => !r.diff))}</tbody></table></html>`;

await mkdir(a["out-reports"], { recursive: true });
await writeFile(`${a["out-reports"]}/availability.json`, JSON.stringify(loc, null, 2) + "\n");
await writeFile(`${a["out-reports"]}/github-availability.json`, JSON.stringify(gh, null, 2) + "\n");
await writeFile(`${a["out-reports"]}/report.md`, report);
await writeFile(`${a["out-reports"]}/index.html`, html);

// README on the default branch: upstream README (status markers now hold home-network results)
// with relative links rewritten to the mirror branch, plus a short banner.
const [owner] = a.repo.split("/");
const base = `https://github.com/${a.repo}/blob/upstream/`;
const readme = (await readFile(a.readme, "utf8"))
  .replace(/\]\((?!https?:|#|<)([^)\s]+)\)/g, (_, p) => `](${base}${p.replace(/^\.\//, "")})`)
  .replace(/\]\(.*?reports\/availability\.json\)/, `](https://github.com/${a.repo}/blob/reports/availability.json)`);
const banner = `> **Home-network fork.** Status columns below were checked from a home connection in NZ on ${when.slice(0, 10)}
> (upstream commit \`${a["upstream-sha"]}\`). [Full report](https://github.com/${a.repo}/blob/reports/report.md) ·
> [Pages](https://${owner}.github.io/${a.repo.split("/")[1]}/) · upstream: [laoma528/awesome-zhuiju-free](https://github.com/laoma528/awesome-zhuiju-free).
> Branches: \`upstream\` = untouched mirror, \`local\` (default) = this README + workflow, \`reports\` = results.

`;
await writeFile(a["out-readme"], banner + readme);
