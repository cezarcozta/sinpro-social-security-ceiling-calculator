import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extrairTextLayer, normalizarItens } from './text-layer';

const TRANSFORM_ROTATE_90 = [0, 1, 1, 0, 0, 0];

describe('normalizarItens', () => {
  it('aplica a transform do viewport de páginas rotate=90', () => {
    const itens = normalizarItens(
      [{ str: 'JOAO PROFESSOR', transform: [0, 10, -10, 0, 121.28, 405] }],
      TRANSFORM_ROTATE_90,
      1,
    );
    expect(itens).toEqual([{ page: 1, x: 405, y: 121, str: 'JOAO PROFESSOR' }]);
  });

  it('descarta itens vazios ou só com espaços', () => {
    const itens = normalizarItens(
      [
        { str: '   ', transform: [1, 0, 0, 1, 10, 10] },
        { str: '', transform: [1, 0, 0, 1, 10, 20] },
      ],
      TRANSFORM_ROTATE_90,
      1,
    );
    expect(itens).toEqual([]);
  });

  it('remove espaços nas bordas e preserva o conteúdo', () => {
    const [item] = normalizarItens([{ str: ' 1.300,00 ', transform: [1, 0, 0, 1, 0, 0] }], TRANSFORM_ROTATE_90, 2);
    expect(item.str).toBe('1.300,00');
    expect(item.page).toBe(2);
  });

  it('ignora itens sem str ou sem transform', () => {
    const itens = normalizarItens([{ foo: 1 }, { str: 'x' }], TRANSFORM_ROTATE_90, 1);
    expect(itens).toEqual([]);
  });
});

const PDF_LOCAL = 'extrato-exemplo.pdf';
const require = createRequire(import.meta.url);
const workerSrc = join(dirname(require.resolve('pdfjs-dist/package.json')), 'legacy', 'build', 'pdf.worker.min.mjs');

describe.skipIf(!existsSync(PDF_LOCAL))('extrairTextLayer (smoke, exige PDF local)', () => {
  it('extrai a camada de texto do extrato real', async () => {
    const buffer = readFileSync(PDF_LOCAL);
    const itens = await extrairTextLayer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      { workerSrc },
    );

    expect(itens.length).toBeGreaterThan(100);
    expect(itens.some((i) => i.str === 'CNIS - Cadastro Nacional de Informações Sociais')).toBe(true);
    expect(new Set(itens.map((i) => i.page))).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});
