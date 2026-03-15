import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

// Brain SVG path - stylized brain icon
function brainSvg(size) {
  const pad = Math.round(size * 0.15);
  const iconSize = size - pad * 2;
  const r = Math.round(size * 0.15);
  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#1a1a1a" rx="${r}"/>
  <g transform="translate(${pad}, ${pad})">
    <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="#a78bfa" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2C10.34 2 9 3.34 9 5C7.34 5 6 6.34 6 8C4.34 8 3 9.79 3 12C3 14.21 4.34 16 6 16C6 17.66 7.34 19 9 19C9 20.66 10.34 22 12 22C13.66 22 15 20.66 15 19C16.66 19 18 17.66 18 16C19.66 16 21 14.21 21 12C21 9.79 19.66 8 18 8C18 6.34 16.66 5 15 5C15 3.34 13.66 2 12 2Z"/>
      <path d="M12 2V22" opacity="0.5"/>
      <path d="M9 8C10.1 8 11.1 8.4 12 9.2C12.9 8.4 13.9 8 15 8" opacity="0.5"/>
      <path d="M9 16C10.1 16 11.1 15.6 12 14.8C12.9 15.6 13.9 16 15 16" opacity="0.5"/>
      <path d="M6 12C7.7 12 9.5 11.3 12 9.2" opacity="0.5"/>
      <path d="M18 12C16.3 12 14.5 11.3 12 9.2" opacity="0.5"/>
    </svg>
  </g>
</svg>`;
}

async function generateIcon(size, filename) {
  await sharp(Buffer.from(brainSvg(size)))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, filename));
  console.log(`Generated ${filename} (${size}x${size})`);
}

await generateIcon(192, "icon-192.png");
await generateIcon(512, "icon-512.png");
await generateIcon(32, "favicon.ico");
console.log("Done!");
