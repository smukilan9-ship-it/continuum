import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const sharp = requireFromWeb("sharp");

const root = fileURLToPath(new URL("../", import.meta.url));
const backgroundPath = `${root}docs/hackathon/continuum-thumbnail-background.png`;
const screenshotPath = `${root}docs/audit-screenshots/premium/chromium-today-dark-1469x861.png`;
const docsOutput = `${root}docs/hackathon/continuum-hackathon-thumbnail.png`;
const publicOutput = `${root}apps/web/public/continuum-hackathon-thumbnail.png`;

const markSvg = (size) => Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#d9ff2f"/>
    <rect x="12" y="32" width="9" height="23" rx="4.5" fill="#171812"/>
    <rect x="25" y="20" width="9" height="35" rx="4.5" fill="#171812"/>
    <rect x="38" y="25" width="9" height="30" rx="4.5" fill="#171812"/>
    <rect x="51" y="12" width="9" height="34" rx="4.5" fill="#171812"/>
    <path d="M16.5 42.5C23 42.5 24.5 35 30 35C35 35 36.5 31 42.5 27.5" fill="none" stroke="#d9ff2f" stroke-width="5" stroke-linecap="round"/>
    <circle cx="30.5" cy="35" r="4.5" fill="#d9ff2f"/>
  </svg>
`);

const screenshotWithMark = await sharp(screenshotPath)
  .composite([{ input: markSvg(31), left: 20, top: 14 }])
  .png()
  .toBuffer();

const screenshot = await sharp(screenshotWithMark)
  .resize(800, 469, { fit: "cover" })
  .png()
  .toBuffer();

const copy = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
    <defs>
      <filter id="shadow" x="-20%" y="-30%" width="150%" height="180%">
        <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#000000" flood-opacity=".45"/>
      </filter>
    </defs>

    <rect x="54" y="54" width="650" height="916" rx="38" fill="#f4f1e7"/>

    <g transform="translate(96 96)">
      <rect width="62" height="62" rx="16" fill="#d9ff2f"/>
      <rect x="11.6" y="31" width="8.7" height="22.3" rx="4.35" fill="#171812"/>
      <rect x="24.2" y="19.4" width="8.7" height="33.9" rx="4.35" fill="#171812"/>
      <rect x="36.8" y="24.2" width="8.7" height="29.1" rx="4.35" fill="#171812"/>
      <rect x="49.4" y="11.6" width="8.7" height="33" rx="4.35" fill="#171812"/>
      <path d="M16 41.2C22.3 41.2 23.7 33.9 29.1 33.9C33.9 33.9 35.4 30.1 41.2 26.7" fill="none" stroke="#d9ff2f" stroke-width="4.8" stroke-linecap="round"/>
      <circle cx="29.6" cy="33.9" r="4.35" fill="#d9ff2f"/>
      <text x="82" y="44" fill="#171812" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" letter-spacing="-1.2">continuum</text>
    </g>

    <text x="96" y="222" fill="#53613c" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" letter-spacing="3">THE ACADEMIC CONTEXT LAYER</text>

    <text x="96" y="322" fill="#11130f" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="800" letter-spacing="-3.4">
      <tspan x="96" dy="0">Never restart</tspan>
      <tspan x="96" dy="76">your academic</tspan>
      <tspan x="96" dy="76">context.</tspan>
    </text>

    <text x="96" y="590" fill="#505248" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="500">
      <tspan x="96" dy="0">Continuum remembers the goals, evidence,</tspan>
      <tspan x="96" dy="37">plans, research, and code behind your work—</tspan>
      <tspan x="96" dy="37">then carries the right context into every AI.</tspan>
    </text>

    <g transform="translate(96 738)">
      <rect width="112" height="42" rx="21" fill="#171812"/><text x="56" y="27" text-anchor="middle" fill="#f4f1e7" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="800" letter-spacing="1.2">PLAN</text>
      <rect x="124" width="112" height="42" rx="21" fill="#171812"/><text x="180" y="27" text-anchor="middle" fill="#f4f1e7" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="800" letter-spacing="1.2">LEARN</text>
      <rect x="248" width="146" height="42" rx="21" fill="#171812"/><text x="321" y="27" text-anchor="middle" fill="#f4f1e7" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="800" letter-spacing="1.2">RESEARCH</text>
      <rect x="406" width="112" height="42" rx="21" fill="#171812"/><text x="462" y="27" text-anchor="middle" fill="#f4f1e7" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="800" letter-spacing="1.2">CODE</text>
    </g>

    <line x1="96" y1="838" x2="650" y2="838" stroke="#cbc9bc" stroke-width="1"/>
    <text x="96" y="886" fill="#11130f" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="800">One verified memory. Every tool.</text>
    <text x="96" y="923" fill="#6b6c63" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="600">Private by design  ·  Evidence-backed  ·  MCP-native</text>

    <text x="734" y="164" fill="#d9ff2f" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" letter-spacing="2.6">ONE WORKSPACE. THE NEXT ACTION IS ALREADY THERE.</text>

    <rect x="686" y="215" width="824" height="493" rx="28" fill="#090b08" opacity=".86" filter="url(#shadow)"/>
    <rect x="696" y="225" width="804" height="473" rx="22" fill="#f4f1e7"/>

    <g transform="translate(742 766)">
      <rect width="708" height="126" rx="24" fill="#171812" stroke="#42463a"/>
      <circle cx="54" cy="63" r="25" fill="#d9ff2f"/>
      <path d="M43 65l7 7 16-19" fill="none" stroke="#171812" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="98" y="53" fill="#f4f1e7" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="800">Context that survives the conversation.</text>
      <text x="98" y="86" fill="#aeb2a4" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="600">Plan → act → verify → remember → continue anywhere.</text>
    </g>
  </svg>
`);

await mkdir(new URL("../apps/web/public/", import.meta.url), { recursive: true });
const finalImage = await sharp(backgroundPath)
  .resize(1536, 1024, { fit: "cover" })
  .composite([
    { input: copy, left: 0, top: 0 },
    { input: screenshot, left: 698, top: 227 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

await sharp(finalImage).toFile(docsOutput);
await sharp(finalImage).toFile(publicOutput);

const metadata = await sharp(finalImage).metadata();
process.stdout.write(JSON.stringify({
  docsOutput,
  publicOutput,
  width: metadata.width,
  height: metadata.height,
  bytes: finalImage.byteLength,
}, null, 2));
