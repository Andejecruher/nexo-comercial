import './copy-email-assets.mjs';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
const directory = new URL('../dist/utils/', import.meta.url);
mkdirSync(directory, { recursive: true });
copyFileSync(
  new URL('../src/utils/detect-file-type.js', import.meta.url),
  new URL('detect-file-type.js', directory),
);
cpSync(
  new URL('../src/ai/services/riva/', import.meta.url),
  new URL('../dist/ai/services/riva/', import.meta.url),
  { recursive: true },
);
