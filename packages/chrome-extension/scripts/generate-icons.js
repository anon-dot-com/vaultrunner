/**
 * Generate VaultRunner extension icons
 * Run with: node scripts/generate-icons.js
 */

import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const iconsDir = join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// VaultRunner icon SVG - a stylized vault/lock with speed lines
const createIconSVG = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
    <linearGradient id="vault" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#e0e7ff"/>
    </linearGradient>
  </defs>

  <!-- Background circle -->
  <circle cx="64" cy="64" r="60" fill="url(#bg)"/>

  <!-- Vault body -->
  <rect x="32" y="44" width="64" height="52" rx="6" fill="url(#vault)"/>

  <!-- Vault door circle -->
  <circle cx="64" cy="70" r="16" fill="none" stroke="#6366f1" stroke-width="4"/>

  <!-- Vault handle -->
  <line x1="64" y1="62" x2="64" y2="54" stroke="#6366f1" stroke-width="4" stroke-linecap="round"/>
  <line x1="56" y1="70" x2="48" y2="70" stroke="#6366f1" stroke-width="4" stroke-linecap="round"/>
  <line x1="72" y1="70" x2="80" y2="70" stroke="#6366f1" stroke-width="4" stroke-linecap="round"/>
  <line x1="64" y1="78" x2="64" y2="86" stroke="#6366f1" stroke-width="4" stroke-linecap="round"/>

  <!-- Lock shackle -->
  <path d="M 48 44 L 48 36 C 48 24 80 24 80 36 L 80 44"
        fill="none" stroke="url(#vault)" stroke-width="8" stroke-linecap="round"/>

  <!-- Speed lines (runner effect) -->
  <line x1="16" y1="52" x2="28" y2="52" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <line x1="12" y1="64" x2="26" y2="64" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
  <line x1="16" y1="76" x2="28" y2="76" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
</svg>
`;

const sizes = [16, 32, 48, 128];

async function generateIcons() {
  console.log('Generating VaultRunner icons...');

  for (const size of sizes) {
    const svg = createIconSVG(size);
    const outputPath = join(iconsDir, `icon${size}.png`);

    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`  ✓ Created icon${size}.png`);
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
