import { createDeflate } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = new URL(".", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function textPixels(width, height, frame) {
  const bg = [
    [247, 248, 245],
    [235, 243, 239],
    [246, 238, 232],
    [232, 239, 246],
    [241, 242, 235]
  ][frame - 1];
  const accent = [
    [15, 91, 66],
    [122, 62, 36],
    [34, 72, 116],
    [32, 92, 92],
    [88, 82, 36]
  ][frame - 1];
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const inBand = y > 110 && y < 650 && x > 80 && x < 1190;
      const stripe = Math.floor((x + y + frame * 80) / 48) % 5 === 0;
      const color = inBand && stripe ? accent : bg;
      const i = 1 + x * 3;
      row[i] = color[0];
      row[i + 1] = color[1];
      row[i + 2] = color[2];
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

async function png(width, height, frame) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const compressed = await new Promise((resolve, reject) => {
    const deflate = createDeflate();
    const parts = [];
    deflate.on("data", (part) => parts.push(part));
    deflate.on("error", reject);
    deflate.on("end", () => resolve(Buffer.concat(parts)));
    deflate.end(textPixels(width, height, frame));
  });
  return Buffer.concat([
    header,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const captions = [
  "Hero: address provisioning and the one-liner",
  "Approval console: flagged outbound email with Approve/Deny",
  "Policy YAML beside a blocked send terminal",
  "Architecture: agent to mailbox to BYO provider",
  "Comparison table vs hosted incumbents"
];

for (let i = 1; i <= 5; i += 1) {
  writeFileSync(join(outDir, `gallery-0${i}.png`), await png(1270, 760, i));
}
writeFileSync(join(outDir, "thumbnail.png"), await png(600, 400, 1));
writeFileSync(
  join(outDir, "README.md"),
  [
    "# Product Hunt launch kit",
    "",
    "Tagline: Every agent gets an inbox. You keep the veto.",
    "",
    ...captions.map((caption, index) => `${index + 1}. ${caption}`),
    "",
    "Demo: docker compose up, provision an inbox, send allowed mail, queue flagged mail, approve it, show audit.",
    "",
    "First comment: hosted inboxes are great until you cannot see or stop what your agent sends. This is the self-hosted control layer."
  ].join("\n")
);
