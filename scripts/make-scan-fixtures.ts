/* Writes test "photos" for the P5 smoke: <out>/s131_scan.jpg (QR p1), <out>/next.jpg (p2, no QR), <out>/loose.jpg (no QR).
 * Usage: npx tsx scripts/make-scan-fixtures.ts <outDir> <paperId> <username> */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { scriptSvg } from "./scan-svg";

const [out, paperId, user = "s131"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const title = "中三數學測驗 A：因式分解";
const jobs = [
  { svg: scriptSvg({ school: "Smoke", title, page: 1, name: user, qr: `CAI1:${paperId}:${user}:1`, lines: ["1. A", "2. B", "3. B", "4. A", "5. B", "6. (x+2)(x+3)", "7. 7"], printed: ["一、選擇題"] }), out: path.join(out, "scan_a.jpg"), width: 1240 },
  { svg: scriptSvg({ school: "Smoke", title, page: 2, lines: ["8. (a) (x+2)(x+3)", "(b) x+3", "(c) 周界 = 2(6+7) = 26 米"], printed: ["三、長答題"], tilt: 1 }), out: path.join(out, "scan_b.jpg"), width: 1240 },
  { svg: scriptSvg({ school: "Smoke", title, page: 1, lines: ["1. B", "2. B", "3. A"], printed: [], smudge: true, tilt: -2 }), out: path.join(out, "scan_c.jpg"), width: 1240 },
];
const f = path.join(out, "jobs.json");
fs.writeFileSync(f, JSON.stringify(jobs));
execFileSync(process.execPath, [path.resolve("scripts/render-svg.mjs"), f]);
fs.rmSync(f);
console.log(jobs.map((j) => j.out).join("\n"));
