// Renders SVG files to JPEG with sharp (used by the P5 seed, which is synchronous). Usage: node render-svg.mjs jobs.json
// jobs.json: [{ "svg": "<svg…>", "out": "/abs/path.jpg", "width": 1240 }]; prints [{ width, height }] as JSON.
import fs from "node:fs";
import sharp from "sharp";

const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = [];
for (const j of jobs) {
  const info = await sharp(Buffer.from(j.svg), { density: 110 }).resize({ width: j.width ?? 1240 }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toFile(j.out);
  out.push({ width: info.width, height: info.height });
}
process.stdout.write(JSON.stringify(out));
