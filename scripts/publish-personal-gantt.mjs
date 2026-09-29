import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../personal-gantt/dist/', import.meta.url));
const target = fileURLToPath(new URL('../public/personal-planner/', import.meta.url));
const html = await readFile(new URL('../personal-gantt/dist/index.html', import.meta.url), 'utf8');
if (!html.includes('./assets/')) throw new Error('Planner assets must use relative URLs. Run npm --prefix personal-gantt run build.');
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log('Personal planner published to /personal-planner/index.html');
