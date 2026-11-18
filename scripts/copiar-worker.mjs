import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const origem = join(dirname(require.resolve('pdfjs-dist/package.json')), 'legacy', 'build', 'pdf.worker.min.mjs');
const destino = join(process.cwd(), 'public', 'pdf.worker.min.mjs');

if (!existsSync(origem)) {
  console.error(`[copiar-worker] worker não encontrado em ${origem}`);
  process.exit(1);
}
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origem, destino);
console.log(`[copiar-worker] ${destino}`);
