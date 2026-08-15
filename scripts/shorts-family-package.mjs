import fs from 'fs';
import path from 'path';
import { packageFamilyProject } from '../source-finder/shorts_family.mjs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('사용법: node scripts/shorts-family-package.mjs <project.json>');
  process.exit(1);
}

const resolved = path.resolve(inputPath);
const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
const result = packageFamilyProject(payload);
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
