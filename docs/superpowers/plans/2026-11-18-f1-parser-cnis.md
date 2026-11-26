# F1 — Upload e Parser de CNIS: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ler um extrato CNIS em PDF inteiramente no navegador e produzir um objeto estruturado com os dados do filiado e as remunerações dos vínculos CLT.

**Architecture:** App Next.js sem backend. O PDF é lido no cliente pelo `pdf.js`; a camada de texto é normalizada (as páginas são `rotate=90`), agrupada em linhas por coordenada `y`, e as células são atribuídas a colunas usando as posições `x` da linha de cabeçalho real do documento. Cada módulo de `src/lib/cnis/` é uma função pura; só `text-layer.ts` toca o `pdf.js`, o que permite testar todo o resto sobre uma fixture JSON anonimizada.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · pdfjs-dist 6 · Vitest 5 · tsx (script de fixture)

## Global Constraints

- **Zero backend:** nenhuma rota em `app/api/`, nenhum `fetch` para servidor, nenhuma telemetria. O PDF nunca sai do navegador.
- **Sem CDN:** o worker do `pdf.js` é servido de `public/pdf.worker.min.mjs`, copiado de `node_modules` por script `postinstall`.
- **Sem persistência:** nada em `localStorage`, `sessionStorage`, IndexedDB ou cookies. O PDF vive em estado de componente.
- **`extrato-exemplo.pdf` nunca é commitado** (já no `.gitignore`): contém dados pessoais reais.
- **Nenhuma fixture ou teste contém PII real:** nome, NIT, CPF, nome da mãe e razão social são substituídos por valores fictícios.
- Versões exatas: `next@16.4.6`, `react@19.3.1`, `pdfjs-dist@6.5.438`, `vitest@5.1.1`, `tailwindcss@4.3.5`.
- Código, identificadores e mensagens em português (domínio previdenciário brasileiro); tipos e nomes de função em português, como no spec.
- TypeScript `strict: true`. Nenhum `any` sem comentário justificando.
- Valores monetários sempre em **centavos inteiros**. Nunca `float` para dinheiro.
- Nenhum dado descartado em silêncio: toda anomalia vira `ParseWarning` com página e `seq`.

**Spec:** `docs/superpowers/specs/2026-11-18-f1-parser-cnis-design.md`

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts` | configuração |
| `scripts/copiar-worker.mjs` | copia o worker do pdf.js para `public/` no `postinstall` |
| `scripts/make-fixture.ts` | gera a fixture anonimizada a partir do PDF local |
| `src/lib/cnis/types.ts` | tipos do domínio, códigos de erro/aviso, `CnisParseError` |
| `src/lib/cnis/text-layer.ts` | `pdf.js` → `TextItem[]` normalizado (única dependência do pdf.js) |
| `src/lib/cnis/rows.ts` | `TextItem[]` → `Row[]` (cluster por `y`) |
| `src/lib/cnis/table.ts` | cabeçalho + linha → células por coluna; parsing de valor em centavos |
| `src/lib/cnis/sections.ts` | classificação de cada linha (cabeçalho de página, filiado, vínculo, seção, fim, dados) |
| `src/lib/cnis/parse-cnis.ts` | máquina de estados que monta o `CnisExtrato` |
| `src/lib/cnis/index.ts` | API pública: `parseCnis` |
| `src/app/layout.tsx`, `src/app/page.tsx` | shell do app |
| `src/components/upload-cnis.tsx` | dropzone + exibição do resultado (client component) |

---

### Task 1: Scaffold do app e da suíte de testes

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `scripts/copiar-worker.mjs`
- Create: `src/lib/cnis/smoke.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: projeto Next.js rodando com `npm run dev`, `npm test` executando Vitest, e `public/pdf.worker.min.mjs` presente após `npm install`

- [ ] **Step 1: Criar o app Next.js na raiz do repositório**

O repositório já tem `AGENTS.md`, `docs/` e `.gitignore`. `create-next-app` precisa de diretório vazio, então crie fora e mova:

```bash
cd /home/cesarcosta
npx --yes create-next-app@16.4.6 sinpro-tmp \
  --ts --tailwind --eslint --app --src-dir --turbopack \
  --import-alias "@/*" --use-npm --no-git
cd sinpro-tmp && rm -rf .git node_modules README.md public/*.svg
cp -r . /home/cesarcosta/sinpro-calculator/
cd /home/cesarcosta/sinpro-calculator && rm -rf /home/cesarcosta/sinpro-tmp
```

Verifique que `.gitignore` não foi sobrescrito com perda da regra do PDF; ele deve conter `extrato-exemplo.pdf` e `*.pdf` com exceção para `docs/`. Se `create-next-app` substituiu o arquivo, restaure as três linhas:

```
extrato-exemplo.pdf
*.pdf
!docs/**/*.pdf
```

E acrescente ao final:

```
public/pdf.worker.min.mjs
```

- [ ] **Step 2: Instalar as dependências do parser e dos testes**

```bash
npm install pdfjs-dist@6.5.438
npm install -D vitest@5.1.1 tsx@4.23.15
```

- [ ] **Step 3: Script que copia o worker do pdf.js para `public/`**

Crie `scripts/copiar-worker.mjs`:

```js
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const origem = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build', 'pdf.worker.min.mjs');
const destino = join(process.cwd(), 'public', 'pdf.worker.min.mjs');

if (!existsSync(origem)) {
  console.error(`[copiar-worker] worker não encontrado em ${origem}`);
  process.exit(1);
}
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origem, destino);
console.log(`[copiar-worker] ${destino}`);
```

Em `package.json`, adicione aos `scripts`:

```json
"postinstall": "node scripts/copiar-worker.mjs",
"test": "vitest run",
"test:watch": "vitest",
"fixture": "tsx scripts/make-fixture.ts"
```

- [ ] **Step 4: Configurar o Vitest**

Crie `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Escrever o teste de fumaça (vai falhar)**

Crie `src/lib/cnis/smoke.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('scaffold', () => {
  it('copiou o worker do pdf.js para public/', () => {
    expect(existsSync('public/pdf.worker.min.mjs')).toBe(true);
  });
});
```

- [ ] **Step 6: Rodar e verificar**

```bash
node scripts/copiar-worker.mjs && npm test
```

Esperado: 1 teste passando. Se o worker não existir, o teste falha com `expected false to be true` — rode `npm install` novamente.

- [ ] **Step 7: Verificar que o app builda e sobe**

```bash
npm run build
```

Esperado: build concluído sem erro de tipo.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold do app Next.js com Vitest e worker do pdf.js"
```

---

### Task 2: Tipos do domínio e agrupamento em linhas

**Files:**
- Create: `src/lib/cnis/types.ts`
- Create: `src/lib/cnis/rows.ts`
- Test: `src/lib/cnis/rows.test.ts`

**Interfaces:**
- Consumes: scaffold da Task 1
- Produces:
  - `type TextItem = { page: number; x: number; y: number; str: string }`
  - `type Row = { page: number; y: number; items: TextItem[] }`
  - `agruparEmLinhas(items: TextItem[], toleranciaY?: number): Row[]`
  - `textoDaLinha(linha: Row): string`
  - tipos `CnisExtrato`, `Vinculo`, `Remuneracao`, `VinculoIgnorado`, `Filiado`, `ParseWarning`, `ParseResult` e a classe `CnisParseError`

- [ ] **Step 1: Escrever os tipos**

Crie `src/lib/cnis/types.ts`:

```ts
/** Item de texto do PDF, já normalizado para coordenadas de leitura. */
export type TextItem = { page: number; x: number; y: number; str: string };

/** Itens que compartilham a mesma linha visual, ordenados por x. */
export type Row = { page: number; y: number; items: TextItem[] };

export type Remuneracao = {
  /** "MM/AAAA"; MM pode ser 13 (gratificação natalina). */
  competencia: string;
  valorCentavos: number;
  indicadores: string[];
};

export type Vinculo = {
  seq: number;
  nit?: string;
  /** Pode ser CNPJ ("12.345.678/0001-95") ou código CEI/CNO ("98.765.432"). String opaca. */
  codigoEmp?: string;
  origem?: string;
  matricula?: string;
  tipoFiliado: string;
  dataInicio?: string;
  dataFim?: string;
  ultRemun?: string;
  remuneracoes: Remuneracao[];
};

export type VinculoIgnorado = { seq: number; tipoFiliado: string; motivo: 'NAO_CLT' };

export type Filiado = {
  nome?: string;
  nit?: string;
  cpf?: string;
  dataNascimento?: string;
  nomeMae?: string;
};

export type CnisExtrato = {
  filiado: Filiado;
  geradoEm?: string;
  vinculos: Vinculo[];
  ignorados: VinculoIgnorado[];
};

export type WarningCode = 'LAYOUT_DESCONHECIDO' | 'CELULA_ORFA' | 'COMPETENCIA_DUPLICADA';

export type ParseWarning = {
  codigo: WarningCode;
  pagina: number;
  seq?: number;
  detalhe: string;
};

export type ParseResult = { extrato: CnisExtrato; warnings: ParseWarning[] };

export type ErroCode = 'NAO_E_CNIS' | 'SEM_CAMADA_DE_TEXTO' | 'PDF_PROTEGIDO';

export class CnisParseError extends Error {
  constructor(
    public readonly codigo: ErroCode,
    message: string,
  ) {
    super(message);
    this.name = 'CnisParseError';
  }
}

/** Marca o vínculo como CLT (empregado), único tipo considerado em F1. */
export const TIPO_FILIADO_CLT = 'Empregado ou Agente Público';
```

- [ ] **Step 2: Escrever os testes de `agruparEmLinhas` (vão falhar)**

Crie `src/lib/cnis/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agruparEmLinhas, textoDaLinha } from './rows';
import type { TextItem } from './types';

const item = (page: number, x: number, y: number, str: string): TextItem => ({ page, x, y, str });

describe('agruparEmLinhas', () => {
  it('agrupa itens da mesma linha e os ordena por x', () => {
    const linhas = agruparEmLinhas([
      item(1, 318, 282, '04/2017'),
      item(1, 55, 282, '03/2017'),
      item(1, 148, 282, '366,67'),
    ]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].items.map((i) => i.str)).toEqual(['03/2017', '366,67', '04/2017']);
  });

  it('separa linhas distantes além da tolerância', () => {
    const linhas = agruparEmLinhas([item(1, 55, 282, 'a'), item(1, 55, 297, 'b')]);
    expect(linhas.map((l) => l.y)).toEqual([282, 297]);
  });

  it('mantém juntos itens com pequena variação de baseline', () => {
    const linhas = agruparEmLinhas([item(1, 55, 282, 'a'), item(1, 148, 284, 'b')]);
    expect(linhas).toHaveLength(1);
  });

  it('nunca junta itens de páginas diferentes, mesmo com o mesmo y', () => {
    const linhas = agruparEmLinhas([item(2, 55, 282, 'b'), item(1, 55, 282, 'a')]);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.page)).toEqual([1, 2]);
  });

  it('ordena as linhas por página e por y crescente', () => {
    const linhas = agruparEmLinhas([item(2, 10, 50, 'c'), item(1, 10, 90, 'b'), item(1, 10, 30, 'a')]);
    expect(linhas.map((l) => l.items[0].str)).toEqual(['a', 'b', 'c']);
  });
});

describe('textoDaLinha', () => {
  it('junta os itens com espaço, na ordem de x', () => {
    const [linha] = agruparEmLinhas([item(1, 263, 121, 'CPF:'), item(1, 25, 121, 'NIT:')]);
    expect(textoDaLinha(linha)).toBe('NIT: CPF:');
  });
});
```

- [ ] **Step 3: Rodar os testes e verificar que falham**

```bash
npm test -- rows
```

Esperado: FAIL — `Failed to resolve import "./rows"`.

- [ ] **Step 4: Implementar `rows.ts`**

```ts
import type { Row, TextItem } from './types';

/**
 * Agrupa itens de texto em linhas visuais. Os itens chegam com y crescente de cima
 * para baixo; pequenas variações de baseline dentro de uma mesma linha (até
 * `toleranciaY`) são absorvidas.
 */
export function agruparEmLinhas(items: TextItem[], toleranciaY = 3): Row[] {
  const ordenados = [...items].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const linhas: Row[] = [];

  for (const item of ordenados) {
    const atual = linhas.at(-1);
    if (atual && atual.page === item.page && Math.abs(item.y - atual.y) <= toleranciaY) {
      atual.items.push(item);
    } else {
      linhas.push({ page: item.page, y: item.y, items: [item] });
    }
  }

  for (const linha of linhas) {
    linha.items.sort((a, b) => a.x - b.x);
  }
  return linhas;
}

export function textoDaLinha(linha: Row): string {
  return linha.items.map((i) => i.str).join(' ');
}
```

- [ ] **Step 5: Rodar os testes e verificar que passam**

```bash
npm test -- rows
```

Esperado: 6 testes passando.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cnis/types.ts src/lib/cnis/rows.ts src/lib/cnis/rows.test.ts
git commit -m "feat(cnis): tipos do dominio e agrupamento de itens em linhas"
```

---

### Task 3: Camada de texto do pdf.js e fixture anonimizada

**Files:**
- Create: `src/lib/cnis/text-layer.ts`
- Create: `scripts/make-fixture.ts`
- Create: `src/lib/cnis/__fixtures__/extrato-exemplo.textlayer.json` (gerado)
- Test: `src/lib/cnis/text-layer.test.ts`

**Interfaces:**
- Consumes: `TextItem`, `CnisParseError` (Task 2)
- Produces:
  - `normalizarItens(items: unknown[], transform: number[], page: number): TextItem[]`
  - `extrairTextLayer(data: ArrayBuffer, opcoes?: { workerSrc?: string }): Promise<TextItem[]>`
  - a fixture `extrato-exemplo.textlayer.json`, um `TextItem[]` serializado, consumida pelas Tasks 4–6

- [ ] **Step 1: Implementar `text-layer.ts`**

As páginas do CNIS são `rotate=90`; sem aplicar a transform do viewport, a ordem dos itens é coluna-maior e inútil. `Util.transform` converte a matriz do item para coordenadas de leitura, onde `t[4]` é x e `t[5]` é y.

```ts
import { CnisParseError, type TextItem } from './types';

type ItemComTransform = { str: string; transform: number[] };

/** Aplica a transform do viewport e arredonda para inteiros (precisão suficiente a 1pt). */
export function normalizarItens(items: unknown[], transform: number[], page: number): TextItem[] {
  const [a, b, c, d, e, f] = transform;
  const resultado: TextItem[] = [];

  for (const bruto of items as ItemComTransform[]) {
    if (typeof bruto?.str !== 'string' || !Array.isArray(bruto.transform)) continue;
    const str = bruto.str.trim();
    if (str === '') continue;

    const [, , , , x0, y0] = bruto.transform;
    resultado.push({
      page,
      x: Math.round(a * x0 + c * y0 + e),
      y: Math.round(b * x0 + d * y0 + f),
      str,
    });
  }
  return resultado;
}

/**
 * Lê o PDF e devolve a camada de texto normalizada. Roda no navegador
 * (worker servido de /pdf.worker.min.mjs) e em Node, passando `workerSrc`.
 */
export async function extrairTextLayer(
  data: ArrayBuffer,
  opcoes: { workerSrc?: string } = {},
): Promise<TextItem[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = opcoes.workerSrc ?? '/pdf.worker.min.mjs';

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
  } catch (erro) {
    if (erro instanceof Error && erro.name === 'PasswordException') {
      throw new CnisParseError('PDF_PROTEGIDO', 'O PDF está protegido por senha.');
    }
    throw erro;
  }

  const itens: TextItem[] = [];
  for (let pagina = 1; pagina <= doc.numPages; pagina++) {
    const page = await doc.getPage(pagina);
    const viewport = page.getViewport({ scale: 1 });
    const conteudo = await page.getTextContent();
    itens.push(...normalizarItens(conteudo.items, viewport.transform, pagina));
  }

  if (itens.length === 0) {
    throw new CnisParseError(
      'SEM_CAMADA_DE_TEXTO',
      'O PDF não tem texto selecionável. Baixe o extrato pelo portal Meu INSS em vez de usar uma foto ou digitalização.',
    );
  }
  return itens;
}
```

- [ ] **Step 2: Escrever os testes de `normalizarItens` (vão falhar se a implementação divergir)**

Crie `src/lib/cnis/text-layer.test.ts`. A transform do viewport das páginas deste extrato (`rotate=90`) é `[0, 1, 1, 0, 0, 0]`, e o item "JOAO PROFESSOR DA SILVA" tem transform bruta `[0, 10, -10, 0, 121.28, 405]` — ambas medidas rodando o pdf.js contra o extrato real, e `(121.28, 405)` normaliza para `x=405, y=121`:

```ts
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
const workerSrc = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build', 'pdf.worker.min.mjs');

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
```

- [ ] **Step 3: Rodar os testes**

```bash
npm test -- text-layer
```

Esperado: 4 testes de `normalizarItens` passando. O bloco de smoke roda só se `extrato-exemplo.pdf` estiver na raiz; se estiver, são 5 passando.

- [ ] **Step 4: Escrever o script de fixture anonimizada**

Crie `scripts/make-fixture.ts`. Ele usa o build `legacy` do pdf.js (necessário em Node) e **a mesma** função `normalizarItens` do runtime, para que a fixture não possa divergir do que o app enxerga:

```ts
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { normalizarItens } from '../src/lib/cnis/text-layer';
import type { TextItem } from '../src/lib/cnis/types';

const ENTRADA = process.argv[2] ?? 'extrato-exemplo.pdf';
const CODIGO_AUTENTICACAO_FICTICIO = '081118AAAAAAAAAAAAAAAA';
const SAIDA = 'src/lib/cnis/__fixtures__/extrato-exemplo.textlayer.json';

const ARQUIVO_MAPA = 'anonimizacao.local.json';

/**
 * Anonimização em quatro etapas, nesta ordem:
 *  1. substituições de texto fixo, lidas de `anonimizacao.local.json` (raiz do repo);
 *  2. código de autenticação (padrão genérico) -> valor fictício;
 *  3. deslocamento de datas (-10 anos), casando o item inteiro;
 *  4. verificação positiva: falha se sobrar qualquer formato genérico de documento ou
 *     de código de autenticação fora da lista de valores fictícios permitidos.
 *
 * O repositório é público: nada que identifique o filiado ou seus empregadores pode entrar.
 * O mapa "original -> fictício" é, por si só, a chave que reverte a anonimização; por isso
 * ele vive SÓ no arquivo local, que está no .gitignore e NUNCA deve ser versionado.
 *
 * Formato do `anonimizacao.local.json`: lista de pares aplicada NA ORDEM do arquivo
 * (texto literal, comparação sem distinção de maiúsculas/minúsculas):
 *   [ { "de": "<valor real>", "para": "<valor fictício>" }, ... ]
 * A ordem importa: a variante longa de um CNPJ tem que vir antes da curta, senão a curta
 * a corromperia. Os valores fictícios de documentos devem constar em PERMITIDOS abaixo.
 */
interface Substituicao {
  de: string;
  para: string;
}

function carregarMapa(): Array<[RegExp, string]> {
  if (!existsSync(ARQUIVO_MAPA)) {
    console.error(
      `[make-fixture] Arquivo "${ARQUIVO_MAPA}" não encontrado na raiz do repositório.\n` +
        'Ele deve conter a lista de pares { "de": "<valor real>", "para": "<valor fictício>" } ' +
        'que anonimiza o extrato (nomes, documentos, empregadores), aplicada na ordem do arquivo.\n' +
        'Ele não é versionado de propósito: o mapa original -> fictício reverteria a anonimização.',
    );
    process.exit(1);
  }
  const bruto: unknown = JSON.parse(readFileSync(ARQUIVO_MAPA, 'utf8'));
  if (!Array.isArray(bruto)) {
    console.error(`[make-fixture] "${ARQUIVO_MAPA}" deve ser uma lista de pares { de, para }.`);
    process.exit(1);
  }
  return (bruto as Substituicao[]).map(({ de, para }) => {
    if (typeof de !== 'string' || typeof para !== 'string' || de === '') {
      console.error(`[make-fixture] "${ARQUIVO_MAPA}" tem um par inválido.`);
      process.exit(1);
    }
    return [new RegExp(de.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'gi'), para];
  });
}

const ANOS_DESLOCADOS = 10;

/** Desloca o ano de itens que são datas inteiras. Nunca toca valores monetários ou outros números. */
function deslocarData(str: string): string {
  const recuar = (ano: string) => String(Number(ano) - ANOS_DESLOCADOS);
  let m = /^(\d{2}\/\d{2}\/)(\d{4}) \d{2}:\d{2}:\d{2}$/.exec(str);
  if (m) return `${m[1]}${recuar(m[2])} 00:00:00`;
  m = /^(\d{2}\/\d{2}\/)(\d{4})$/.exec(str);
  if (m) return `${m[1]}${recuar(m[2])}`;
  m = /^(\d{2}\/)(\d{4})$/.exec(str);
  if (m) return `${m[1]}${recuar(m[2])}`;
  if (/^20\d{2}$/.test(str)) return recuar(str);
  return str;
}

const PADRAO_CODIGO_AUTENTICACAO = /\b\d{6}[A-Z0-9]{16}\b/g;

function anonimizar(str: string, mapa: Array<[RegExp, string]>): string {
  const comMapa = mapa.reduce((texto, [de, para]) => texto.replace(de, para), str);
  return deslocarData(comMapa.replace(PADRAO_CODIGO_AUTENTICACAO, CODIGO_AUTENTICACAO_FICTICIO));
}

/** Valores fictícios que podem aparecer na fixture. Qualquer outro documento genérico reprova. */
const PERMITIDOS = new Set([
  '123.45678.90-1',
  '987.65432.10-9',
  '111.222.333-44',
  '12.345.678/0001-95',
  '98.765.432',
  '11.222.333/0001-81',
  '11.222.333',
  CODIGO_AUTENTICACAO_FICTICIO,
]);

const PADROES_GENERICOS: RegExp[] = [
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, // CNPJ
  /\b\d{2}\.\d{3}\.\d{3}\b(?!\/)/g, // código CEI/CNO
  /\d{3}\.\d{3}\.\d{3}-\d{2}/g, // CPF
  /\d{3}\.\d{5}\.\d{2}-\d/g, // NIT/PIS
  /\b\d{6}[A-Z0-9]{16}\b/g, // código de autenticação
];

function violacoesDePii(itens: TextItem[]): string[] {
  const achados: string[] = [];
  for (const { str } of itens) {
    for (const padrao of PADROES_GENERICOS) {
      for (const ocorrencia of str.matchAll(padrao)) {
        if (!PERMITIDOS.has(ocorrencia[0])) achados.push(ocorrencia[0]);
      }
    }
  }
  return achados;
}

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = join(
  dirname(require.resolve('pdfjs-dist/package.json')),
  'legacy',
  'build',
  'pdf.worker.min.mjs',
);

// O package.json é CommonJS, então não há top-level await: o corpo vai numa função async.
async function main(): Promise<void> {
  const mapa = carregarMapa();
  const buffer = readFileSync(ENTRADA);
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;

  const itens: TextItem[] = [];
  for (let pagina = 1; pagina <= doc.numPages; pagina++) {
    const page = await doc.getPage(pagina);
    const viewport = page.getViewport({ scale: 1 });
    const conteudo = await page.getTextContent();
    itens.push(...normalizarItens(conteudo.items, viewport.transform, pagina));
  }

  const anonimizados = itens.map((i) => ({ ...i, str: anonimizar(i.str, mapa) }));

  const sobrou = violacoesDePii(anonimizados);
  if (sobrou.length > 0) {
    // Só a contagem: imprimir o valor vazaria o dado que o check existe para barrar.
    console.error(`[make-fixture] ${sobrou.length} ocorrência(s) de PII genérica fora da lista permitida.`);
    process.exit(1);
  }

  mkdirSync(dirname(SAIDA), { recursive: true });
  writeFileSync(SAIDA, `${JSON.stringify(anonimizados, null, 0)}\n`);
  console.log(`[make-fixture] ${anonimizados.length} itens -> ${SAIDA}`);
}

main().catch((erro) => {
  console.error('[make-fixture] falhou:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
```

- [ ] **Step 5: Gerar a fixture e conferir que não tem PII**

```bash
npm run fixture
# gera os padrões (literais e com ponto/barra escapados) a partir do mapa local; nunca os imprima
node -e 'const m=require("./anonimizacao.local.json");console.log(m.flatMap(({de})=>[de,de.replace(/[.\/]/g,"\\$&")]).join("\n"))' > /tmp/pii-padroes.txt
git ls-files -z | xargs -0 grep -ciF -f /tmp/pii-padroes.txt | grep -v ':0$'
```

Esperado: a geração imprime a contagem de itens; o `grep` não lista nenhum arquivo. Se retornar qualquer coisa diferente de `0`, **não commite**: acrescente o par faltante em `anonimizacao.local.json` e regenere.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cnis/text-layer.ts src/lib/cnis/text-layer.test.ts scripts/make-fixture.ts src/lib/cnis/__fixtures__/extrato-exemplo.textlayer.json
git commit -m "feat(cnis): camada de texto do pdf.js e fixture anonimizada"
```

---

### Task 4: Mapeamento de colunas e leitura de células

**Files:**
- Create: `src/lib/cnis/table.ts`
- Test: `src/lib/cnis/table.test.ts`

**Interfaces:**
- Consumes: `Row` (Task 2)
- Produces:
  - `type Coluna = { nome: string; x: number; grupo: number }`
  - `mapearColunas(cabecalho: Row, nomesEsperados: string[]): Coluna[] | null`
  - `colunasDoCabecalho(cabecalho: Row): Coluna[]`
  - `celulasPorGrupo(linha: Row, colunas: Coluna[]): Array<Record<string, string>>`
  - `parseValorCentavos(texto: string): number | null`

Por que a atribuição por ponto médio: no extrato, os rótulos do cabeçalho ficam em `x = 43, 131, 221, 306, 394, 484, 567, 655, 747` e as células caem deslocadas alguns pontos à direita (ex.: `55`, `148`, `318`, `407`). Usar o ponto médio entre rótulos vizinhos como fronteira acerta todas as células e funciona igual para um grupo (tabela de 7 colunas do Contribuinte Individual) ou três (tabela CLT).

- [ ] **Step 1: Escrever os testes (vão falhar)**

Crie `src/lib/cnis/table.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agruparEmLinhas } from './rows';
import { celulasPorGrupo, colunasDoCabecalho, mapearColunas, parseValorCentavos } from './table';
import type { TextItem } from './types';

const linhaDe = (pares: Array<[number, string]>, y = 100, page = 1): ReturnType<typeof agruparEmLinhas>[number] => {
  const items: TextItem[] = pares.map(([x, str]) => ({ page, x, y, str }));
  return agruparEmLinhas(items)[0];
};

const CABECALHO_CLT = linhaDe([
  [43, 'Competência'], [131, 'Remuneração'], [221, 'Indicadores'],
  [306, 'Competência'], [394, 'Remuneração'], [484, 'Indicadores'],
  [567, 'Competência'], [655, 'Remuneração'], [747, 'Indicadores'],
]);

describe('mapearColunas', () => {
  it('reconhece os três grupos da tabela de remunerações CLT', () => {
    const colunas = mapearColunas(CABECALHO_CLT, ['Competência', 'Remuneração', 'Indicadores']);
    expect(colunas).not.toBeNull();
    expect(colunas).toHaveLength(9);
    expect(colunas!.map((c) => c.grupo)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(colunas![4]).toEqual({ nome: 'Remuneração', x: 394, grupo: 1 });
  });

  it('reconhece um cabeçalho de grupo único', () => {
    const colunas = mapearColunas(linhaDe([[43, 'Competência'], [131, 'Remuneração'], [221, 'Indicadores']]), [
      'Competência', 'Remuneração', 'Indicadores',
    ]);
    expect(colunas!.map((c) => c.grupo)).toEqual([0, 0, 0]);
  });

  it('devolve null quando o cabeçalho não bate com o esperado', () => {
    const outro = linhaDe([
      [47, 'Competência'], [157, 'Contrat.'], [248, 'Estabelecimento'],
      [383, 'Tomador'], [482, 'Forma Prestação Serviço'], [619, 'Remuneração'], [733, 'Indicadores'],
    ]);
    expect(mapearColunas(outro, ['Competência', 'Remuneração', 'Indicadores'])).toBeNull();
  });

  it('devolve null quando a contagem não é múltiplo do grupo', () => {
    expect(mapearColunas(linhaDe([[43, 'Competência'], [131, 'Remuneração']]), ['Competência', 'Remuneração', 'Indicadores'])).toBeNull();
  });
});

describe('colunasDoCabecalho', () => {
  it('usa cada rótulo como uma coluna do grupo 0', () => {
    const colunas = colunasDoCabecalho(linhaDe([[35, 'Seq.'], [87, 'NIT'], [152, 'Código Emp.']]));
    expect(colunas).toEqual([
      { nome: 'Seq.', x: 35, grupo: 0 },
      { nome: 'NIT', x: 87, grupo: 0 },
      { nome: 'Código Emp.', x: 152, grupo: 0 },
    ]);
  });
});

describe('celulasPorGrupo', () => {
  const colunas = mapearColunas(CABECALHO_CLT, ['Competência', 'Remuneração', 'Indicadores'])!;

  it('separa as três competências de uma linha da tabela CLT', () => {
    const grupos = celulasPorGrupo(
      linhaDe([[55, '03/2017'], [148, '366,67'], [318, '04/2017'], [407, '1.025,18'], [579, '05/2017'], [668, '1.300,00']]),
      colunas,
    );
    expect(grupos).toEqual([
      { 'Competência': '03/2017', 'Remuneração': '366,67' },
      { 'Competência': '04/2017', 'Remuneração': '1.025,18' },
      { 'Competência': '05/2017', 'Remuneração': '1.300,00' },
    ]);
  });

  it('devolve apenas os grupos preenchidos quando a linha é parcial', () => {
    const grupos = celulasPorGrupo(linhaDe([[55, '12/2017'], [144, '1.478,15']]), colunas);
    expect(grupos).toEqual([{ 'Competência': '12/2017', 'Remuneração': '1.478,15' }]);
  });

  it('inclui indicadores quando presentes', () => {
    const grupos = celulasPorGrupo(linhaDe([[55, '06/2018'], [144, '658,58'], [228, 'IREM-INDPEND']]), colunas);
    expect(grupos).toEqual([{ 'Competência': '06/2018', 'Remuneração': '658,58', 'Indicadores': 'IREM-INDPEND' }]);
  });

  it('concatena com espaço dois itens que caem na mesma coluna', () => {
    const colunasVinculo = colunasDoCabecalho(linhaDe([[35, 'Seq.'], [582, 'Vínculo']]));
    const grupos = celulasPorGrupo(linhaDe([[554, 'Empregado ou Agente'], [585, 'Público']]), colunasVinculo);
    expect(grupos).toEqual([{ 'Vínculo': 'Empregado ou Agente Público' }]);
  });
});

describe('parseValorCentavos', () => {
  it.each([
    ['366,67', 36667],
    ['1.300,00', 130000],
    ['10.428,53', 1042853],
    ['0,00', 0],
  ])('converte %s em %i centavos', (texto, esperado) => {
    expect(parseValorCentavos(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '1.300', '1300,0', '7.507,49 *'])('rejeita %s', (texto) => {
    expect(parseValorCentavos(texto)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

```bash
npm test -- table
```

Esperado: FAIL — `Failed to resolve import "./table"`.

- [ ] **Step 3: Implementar `table.ts`**

```ts
import type { Row } from './types';

export type Coluna = { nome: string; x: number; grupo: number };

/**
 * Valida o cabeçalho contra a sequência de rótulos esperada, aceitando a
 * repetição em N grupos de colunas. Devolve null se o layout não for o esperado
 * — quem chama decide se isso é um aviso ou um bloco a ignorar.
 */
export function mapearColunas(cabecalho: Row, nomesEsperados: string[]): Coluna[] | null {
  const itens = cabecalho.items;
  if (itens.length === 0 || nomesEsperados.length === 0) return null;
  if (itens.length % nomesEsperados.length !== 0) return null;

  const colunas: Coluna[] = [];
  for (let i = 0; i < itens.length; i++) {
    const esperado = nomesEsperados[i % nomesEsperados.length];
    if (itens[i].str !== esperado) return null;
    colunas.push({ nome: esperado, x: itens[i].x, grupo: Math.floor(i / nomesEsperados.length) });
  }
  return colunas;
}

/** Usa os rótulos do cabeçalho como colunas, sem esperar layout conhecido. */
export function colunasDoCabecalho(cabecalho: Row): Coluna[] {
  return cabecalho.items.map((item) => ({ nome: item.str, x: item.x, grupo: 0 }));
}

/**
 * Atribui cada item da linha à coluna cuja faixa de x o contém, usando o ponto
 * médio entre rótulos vizinhos como fronteira. Devolve um registro por grupo,
 * omitindo grupos sem nenhuma célula.
 */
export function celulasPorGrupo(linha: Row, colunas: Coluna[]): Array<Record<string, string>> {
  if (colunas.length === 0) return [];
  const fronteiras = colunas.slice(0, -1).map((coluna, i) => (coluna.x + colunas[i + 1].x) / 2);
  const porGrupo = new Map<number, Record<string, string>>();

  for (const item of linha.items) {
    const indice = fronteiras.findIndex((fronteira) => item.x < fronteira);
    const coluna = colunas[indice === -1 ? colunas.length - 1 : indice];
    const celulas = porGrupo.get(coluna.grupo) ?? {};
    const anterior = celulas[coluna.nome];
    celulas[coluna.nome] = anterior ? `${anterior} ${item.str}` : item.str;
    porGrupo.set(coluna.grupo, celulas);
  }

  return [...porGrupo.entries()].sort(([a], [b]) => a - b).map(([, celulas]) => celulas);
}

const VALOR = /^\d{1,3}(\.\d{3})*,\d{2}$/;

/** "1.300,00" -> 130000. Devolve null para qualquer coisa que não seja valor puro. */
export function parseValorCentavos(texto: string): number | null {
  const limpo = texto.trim();
  if (!VALOR.test(limpo)) return null;
  return Number(limpo.replaceAll('.', '').replace(',', ''));
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

```bash
npm test -- table
```

Esperado: todos passando (16 casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cnis/table.ts src/lib/cnis/table.test.ts
git commit -m "feat(cnis): mapeamento de colunas por cabecalho e leitura de celulas"
```

---

### Task 5: Classificação das linhas do extrato

**Files:**
- Create: `src/lib/cnis/sections.ts`
- Test: `src/lib/cnis/sections.test.ts`

**Interfaces:**
- Consumes: `Row`, `textoDaLinha` (Tasks 2), `Filiado` (Task 2)
- Produces:
  - `type TipoLinha = 'ignorar' | 'filiado' | 'gerado-em' | 'cabecalho-vinculo' | 'rotulo-secao' | 'fim' | 'dados'`
  - `classificar(linha: Row): TipoLinha`
  - `extrairCamposFiliado(linha: Row): Partial<Filiado>`

Esta é a parte do spec chamada "máquina de estados" dividida em duas: aqui fica a **classificação** de cada linha (pura, trivial de testar); a máquina que consome a classificação fica em `parse-cnis.ts` (Task 6). A fronteira existe porque os rótulos de página/rodapé que se repetem em todas as 5 páginas precisam ser descartados antes de qualquer decisão de estado.

- [ ] **Step 1: Escrever os testes (vão falhar)**

Crie `src/lib/cnis/sections.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agruparEmLinhas } from './rows';
import { classificar, extrairCamposFiliado } from './sections';
import type { TextItem } from './types';

const linhaDe = (pares: Array<[number, string]>, y = 100, page = 1) => {
  const items: TextItem[] = pares.map(([x, str]) => ({ page, x, y, str }));
  return agruparEmLinhas(items)[0];
};

describe('classificar', () => {
  it.each([
    ['INSS', [[407, 'INSS']]],
    ['cabeçalho CNIS', [[280, 'CNIS - Cadastro Nacional de Informações Sociais']]],
    ['título', [[357, 'Extrato Previdenciário']]],
    ['paginação', [[746, 'Página 3 de 5']]],
    ['seção de identificação', [[43, 'Identificação do Filiado']]],
    ['seção de relações', [[43, 'Relações Previdenciárias']]],
    ['rodapé legal', [[25, 'O INSS poderá rever a qualquer tempo as informações constantes deste extrato, observados os arts.19 ao 19-F do RPS aprovado pelo Decreto 3.048/99.']]],
    ['rodapé legal 2', [[25, 'O segurado somente terá reconhecida como tempo de contribuição ao RGPS a competência cujo valor consolidado seja igual ou superior ao salário mínimo']]],
    ['rodapé legal 3', [[25, 'ou agrupamento, conforme o caso, de acordo com o § 14 do art.195 da CF/1988 e art.29 da EC 103/2019.']]],
  ])('ignora %s', (_nome, pares) => {
    expect(classificar(linhaDe(pares as Array<[number, string]>))).toBe('ignorar');
  });

  it('reconhece a data de geração do extrato', () => {
    expect(classificar(linhaDe([[749, '18/11/2026 08:29:58']]))).toBe('gerado-em');
  });

  it.each([
    [[[25, 'NIT:'], [55, '987.65432.10-9'], [228, 'CPF:'], [263, '111.222.333-44'], [361, 'Nome:'], [405, 'JOAO PROFESSOR DA SILVA']]],
    [[[25, 'Data de nascimento:'], [150, '01/01/1980'], [361, 'Nome da mãe:'], [455, 'MARIA PROFESSORA DA SILVA']]],
  ])('reconhece a linha de dados do filiado', (pares) => {
    expect(classificar(linhaDe(pares as Array<[number, string]>))).toBe('filiado');
  });

  it('reconhece o cabeçalho de vínculo pela primeira célula Seq.', () => {
    const linha = linhaDe([[35, 'Seq.'], [87, 'NIT'], [152, 'Código Emp.'], [301, 'Origem do Vínculo']]);
    expect(classificar(linha)).toBe('cabecalho-vinculo');
  });

  it.each(['Remunerações', 'Contribuições'])('reconhece o rótulo de seção %s', (rotulo) => {
    expect(classificar(linhaDe([[54, rotulo]]))).toBe('rotulo-secao');
  });

  it.each(['Valores Consolidados por Ano Civil', 'Legenda de Indicadores'])('trata %s como fim dos vínculos', (rotulo) => {
    expect(classificar(linhaDe([[59, rotulo]]))).toBe('fim');
  });

  it('trata qualquer outra linha como dados', () => {
    expect(classificar(linhaDe([[55, '03/2017'], [148, '366,67']]))).toBe('dados');
    expect(classificar(linhaDe([[474, 'Matrícula do'], [566, 'Tipo Filiado no']]))).toBe('dados');
  });
});

describe('extrairCamposFiliado', () => {
  it('lê NIT, CPF e nome da primeira linha', () => {
    const campos = extrairCamposFiliado(
      linhaDe([[25, 'NIT:'], [55, '987.65432.10-9'], [228, 'CPF:'], [263, '111.222.333-44'], [361, 'Nome:'], [405, 'JOAO PROFESSOR DA SILVA']]),
    );
    expect(campos).toEqual({ nit: '987.65432.10-9', cpf: '111.222.333-44', nome: 'JOAO PROFESSOR DA SILVA' });
  });

  it('lê data de nascimento e nome da mãe da segunda linha', () => {
    const campos = extrairCamposFiliado(
      linhaDe([[25, 'Data de nascimento:'], [150, '01/01/1980'], [361, 'Nome da mãe:'], [455, 'MARIA PROFESSORA DA SILVA']]),
    );
    expect(campos).toEqual({ dataNascimento: '01/01/1980', nomeMae: 'MARIA PROFESSORA DA SILVA' });
  });

  it('ignora rótulo sem valor à direita', () => {
    expect(extrairCamposFiliado(linhaDe([[25, 'NIT:']]))).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

```bash
npm test -- sections
```

Esperado: FAIL — `Failed to resolve import "./sections"`.

- [ ] **Step 3: Implementar `sections.ts`**

```ts
import { textoDaLinha } from './rows';
import type { Filiado, Row } from './types';

export type TipoLinha =
  | 'ignorar'
  | 'filiado'
  | 'gerado-em'
  | 'cabecalho-vinculo'
  | 'rotulo-secao'
  | 'fim'
  | 'dados';

/** Rótulos que se repetem no cabeçalho de toda página e não carregam dado. */
const RUIDO_EXATO = new Set([
  'INSS',
  'CNIS - Cadastro Nacional de Informações Sociais',
  'Extrato Previdenciário',
  'Identificação do Filiado',
  'Relações Previdenciárias',
]);

/** Seções que encerram a varredura de vínculos. */
const FIM = new Set(['Valores Consolidados por Ano Civil', 'Legenda de Indicadores']);

const ROTULOS_SECAO = new Set(['Remunerações', 'Contribuições']);

const PAGINACAO = /^Página \d+ de \d+$/;
const GERADO_EM = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;
const RODAPE = /^(O INSS poderá rever|O segurado somente terá|ou agrupamento, conforme)/;

/** Rótulos que abrem uma linha de dados do filiado. */
const ROTULOS_FILIADO: Record<string, keyof Filiado> = {
  'NIT:': 'nit',
  'CPF:': 'cpf',
  'Nome:': 'nome',
  'Data de nascimento:': 'dataNascimento',
  'Nome da mãe:': 'nomeMae',
};

export function classificar(linha: Row): TipoLinha {
  const texto = textoDaLinha(linha);
  const primeiro = linha.items[0].str;

  if (RUIDO_EXATO.has(texto) || PAGINACAO.test(texto) || RODAPE.test(texto)) return 'ignorar';
  if (GERADO_EM.test(texto)) return 'gerado-em';
  if (primeiro in ROTULOS_FILIADO) return 'filiado';
  if (primeiro === 'Seq.') return 'cabecalho-vinculo';
  if (FIM.has(texto)) return 'fim';
  if (ROTULOS_SECAO.has(texto)) return 'rotulo-secao';
  return 'dados';
}

/**
 * Lê os pares rótulo→valor da linha do filiado. Os rótulos e os valores são
 * itens independentes na mesma linha, em ordem de x, então o valor de cada
 * rótulo é o que vem imediatamente depois dele.
 */
export function extrairCamposFiliado(linha: Row): Partial<Filiado> {
  const campos: Partial<Filiado> = {};
  for (let i = 0; i < linha.items.length; i++) {
    const campo = ROTULOS_FILIADO[linha.items[i].str];
    const proximo = linha.items[i + 1];
    if (campo && proximo && !(proximo.str in ROTULOS_FILIADO)) {
      campos[campo] = proximo.str;
      i++;
    }
  }
  return campos;
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

```bash
npm test -- sections
```

Esperado: todos passando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cnis/sections.ts src/lib/cnis/sections.test.ts
git commit -m "feat(cnis): classificacao das linhas e campos do filiado"
```

---

### Task 6: Máquina de estados e API pública `parseCnis`

**Files:**
- Create: `src/lib/cnis/parse-cnis.ts`
- Create: `src/lib/cnis/index.ts`
- Test: `src/lib/cnis/parse-cnis.test.ts`
- Delete: `src/lib/cnis/smoke.test.ts` (substituído pelos testes reais)

**Interfaces:**
- Consumes: tudo das Tasks 2–5 — `agruparEmLinhas`, `classificar`, `extrairCamposFiliado`, `mapearColunas`, `colunasDoCabecalho`, `celulasPorGrupo`, `parseValorCentavos`, `extrairTextLayer`, `TIPO_FILIADO_CLT`, `CnisParseError`
- Produces:
  - `montarExtrato(itens: TextItem[]): ParseResult`
  - `parseCnis(data: ArrayBuffer, opcoes?: { workerSrc?: string }): Promise<ParseResult>`
  - `index.ts` reexporta `parseCnis`, `CnisParseError` e os tipos do domínio

Os valores de aceite abaixo são os da **fixture anonimizada** gerada na Task 3: os dados pessoais foram
substituídos e todas as datas foram deslocadas em 10 anos (03/2017 no documento original virou 03/2007 na
fixture). Os valores monetários não foram alterados. Use exatamente os valores escritos aqui.

Regras da máquina, todas verificadas contra o extrato real:

1. Linhas `ignorar` não mudam estado — é isso que faz a tabela sobreviver à quebra de página, onde os dados continuam **sem** repetir rótulo de seção nem cabeçalho.
2. `cabecalho-vinculo` guarda as colunas do vínculo (via `colunasDoCabecalho`) e zera a tabela corrente.
3. A primeira linha `dados` depois do cabeçalho de vínculo são os valores; as linhas `dados` seguintes, até o `rotulo-secao`, são continuação (o tipo de filiado vem quebrado em "Empregado ou Agente" + "Público") e são concatenadas na mesma coluna.
4. Vínculo com `tipoFiliado` diferente de `Empregado ou Agente Público` entra em `ignorados` e suas linhas são puladas até o próximo `cabecalho-vinculo` ou `fim` — sem avisos, porque é exclusão por decisão de produto, não anomalia. É o que evita tratar a seção "Remunerações" de 7 colunas do vínculo 5 (Contribuinte Individual) como layout quebrado.
5. Em vínculo CLT, a primeira linha `dados` após `rotulo-secao` é o cabeçalho da tabela; `mapearColunas` com `['Competência','Remuneração','Indicadores']`. Se der `null`, emite `LAYOUT_DESCONHECIDO` e pula até o próximo vínculo.
6. Linha de dados da tabela: se **nenhum** grupo tiver `Competência` em `MM/AAAA`, a linha é fragmento de cabeçalho (ex.: "Matrícula do" / "Tipo Filiado no", que na p.3 aparece depois dos dados) e é descartada sem aviso. Se **algum** grupo tiver competência válida, cada grupo com competência válida e sem valor legível vira `CELULA_ORFA`.
7. Competência repetida no mesmo vínculo vira `COMPETENCIA_DUPLICADA` e **os dois registros são mantidos** — F2 decide o que fazer; o parser não escolhe por ele.
8. `fim` encerra a varredura.

- [ ] **Step 1: Escrever os testes de aceite sobre a fixture (vão falhar)**

Crie `src/lib/cnis/parse-cnis.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/extrato-exemplo.textlayer.json';
import { montarExtrato } from './parse-cnis';
import { CnisParseError, TIPO_FILIADO_CLT, type TextItem } from './types';

const itens = fixture as TextItem[];
const { extrato, warnings } = montarExtrato(itens);
const cents = (valor: string) => Number(valor.replaceAll('.', '').replace(',', ''));

describe('montarExtrato sobre o extrato de exemplo', () => {
  it('lê o cabeçalho do filiado', () => {
    expect(extrato.filiado).toEqual({
      nome: 'JOAO PROFESSOR DA SILVA',
      nit: '987.65432.10-9',
      cpf: '111.222.333-44',
      dataNascimento: '01/01/1970',
      nomeMae: 'MARIA PROFESSORA DA SILVA',
    });
    expect(extrato.geradoEm).toBe('18/11/2016 00:00:00');
  });

  it('devolve os 2 vínculos CLT e registra os 3 ignorados', () => {
    expect(extrato.vinculos.map((v) => v.seq)).toEqual([1, 4]);
    expect(extrato.ignorados).toEqual([
      { seq: 2, tipoFiliado: 'Contribuinte Individual', motivo: 'NAO_CLT' },
      { seq: 3, tipoFiliado: 'Contribuinte Individual', motivo: 'NAO_CLT' },
      { seq: 5, tipoFiliado: 'Contribuinte Individual', motivo: 'NAO_CLT' },
    ]);
  });

  it('lê os campos do vínculo 1', () => {
    const [v1] = extrato.vinculos;
    expect(v1.tipoFiliado).toBe(TIPO_FILIADO_CLT);
    expect(v1.codigoEmp).toBe('12.345.678/0001-95');
    expect(v1.origem).toBe('COLEGIO ALFA LTDA');
    expect(v1.dataInicio).toBe('20/03/2007');
    expect(v1.dataFim).toBe('15/06/2008');
    expect(v1.ultRemun).toBe('06/2008');
  });

  it('preserva Código Emp. que não é CNPJ (CEI/CNO) no vínculo 4', () => {
    expect(extrato.vinculos[1].codigoEmp).toBe('98.765.432');
    expect(extrato.vinculos[1].origem).toBe('ESCOLA BETA S/A');
    expect(extrato.vinculos[1].matricula).toBe('900111');
  });

  it('lê as 16 competências do vínculo 1, em ordem', () => {
    const [v1] = extrato.vinculos;
    expect(v1.remuneracoes).toHaveLength(16);
    expect(v1.remuneracoes[0].competencia).toBe('03/2007');
    expect(v1.remuneracoes.at(-1)!.competencia).toBe('06/2008');
  });

  it.each([
    [0, '03/2007', '366,67'],
    [1, '04/2007', '1.025,18'],
    [9, '12/2007', '1.478,15'],
    [15, '06/2008', '658,58'],
  ])('vínculo 1, remuneração %i = %s / %s', (indice, competencia, valor) => {
    const r = extrato.vinculos[0].remuneracoes[indice];
    expect(r.competencia).toBe(competencia);
    expect(r.valorCentavos).toBe(cents(valor));
  });

  it('lê as 30 competências do vínculo 4, atravessando a quebra de página', () => {
    const v4 = extrato.vinculos[1];
    expect(v4.remuneracoes).toHaveLength(30);
    expect(v4.remuneracoes[0].competencia).toBe('01/2013');
    expect(v4.remuneracoes.at(-1)!.competencia).toBe('06/2015');
    // 10/2013 em diante está na página 3, sem cabeçalho repetido
    expect(v4.remuneracoes.find((r) => r.competencia === '06/2013')!.valorCentavos).toBe(cents('10.428,53'));
    expect(v4.remuneracoes.find((r) => r.competencia === '11/2013')!.valorCentavos).toBe(cents('9.521,45'));
    expect(v4.remuneracoes.find((r) => r.competencia === '03/2014')!.valorCentavos).toBe(cents('11.082,26'));
  });

  it('não produz nenhum aviso para este extrato', () => {
    expect(warnings).toEqual([]);
  });

  it('não inclui competências da seção Valores Consolidados por Ano Civil', () => {
    const todas = extrato.vinculos.flatMap((v) => v.remuneracoes.map((r) => r.competencia));
    expect(todas).not.toContain('2014');
    expect(todas.every((c) => /^(0[1-9]|1[0-3])\/\d{4}$/.test(c))).toBe(true);
  });
});

describe('montarExtrato — casos de erro e aviso', () => {
  it('lança NAO_E_CNIS quando o documento não é um extrato CNIS', () => {
    try {
      montarExtrato([{ page: 1, x: 10, y: 10, str: 'Nota Fiscal' }]);
      expect.unreachable('deveria ter lançado CnisParseError');
    } catch (erro) {
      expect(erro).toBeInstanceOf(CnisParseError);
      expect((erro as CnisParseError).codigo).toBe('NAO_E_CNIS');
    }
  });

  it('emite CELULA_ORFA quando a competência existe sem valor legível', () => {
    const semValor = itens.filter((i) => i.str !== '366,67');
    const { warnings: w } = montarExtrato(semValor);
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'CELULA_ORFA', pagina: 1, seq: 1, detalhe: expect.stringContaining('03/2007') }),
    ]);
  });

  it('emite COMPETENCIA_DUPLICADA e mantém os dois registros', () => {
    const duplicado = itens.map((i) => (i.page === 1 && i.str === '04/2007' ? { ...i, str: '03/2007' } : i));
    const { extrato: e, warnings: w } = montarExtrato(duplicado);
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'COMPETENCIA_DUPLICADA', seq: 1, detalhe: expect.stringContaining('03/2007') }),
    ]);
    expect(e.vinculos[0].remuneracoes.filter((r) => r.competencia === '03/2007')).toHaveLength(2);
  });

  it('emite LAYOUT_DESCONHECIDO quando o cabeçalho da tabela CLT muda', () => {
    const alterado = itens.map((i) =>
      i.page === 1 && i.str === 'Remuneração' && i.x === 131 ? { ...i, str: 'Valor' } : i,
    );
    const { extrato: e, warnings: w } = montarExtrato(alterado);
    expect(w).toEqual([expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', pagina: 1, seq: 1 })]);
    expect(e.vinculos[0].remuneracoes).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

```bash
npm test -- parse-cnis
```

Esperado: FAIL — `Failed to resolve import "./parse-cnis"`.

Se falhar por não achar o JSON, acrescente `"resolveJsonModule": true` ao `tsconfig.json`.

- [ ] **Step 3: Implementar `parse-cnis.ts`**

```ts
import { agruparEmLinhas } from './rows';
import { classificar, extrairCamposFiliado } from './sections';
import { celulasPorGrupo, colunasDoCabecalho, mapearColunas, parseValorCentavos, type Coluna } from './table';
import { extrairTextLayer } from './text-layer';
import {
  CnisParseError,
  TIPO_FILIADO_CLT,
  type CnisExtrato,
  type ParseResult,
  type ParseWarning,
  type Row,
  type TextItem,
  type Vinculo,
} from './types';

const COLUNAS_REMUNERACAO = ['Competência', 'Remuneração', 'Indicadores'];
const COMPETENCIA = /^(0[1-9]|1[0-3])\/\d{4}$/;
const MARCA_CNIS = 'CNIS - Cadastro Nacional de Informações Sociais';

/** Rótulo da coluna do vínculo -> campo do objeto Vinculo. */
const CAMPOS_VINCULO: Record<string, keyof Vinculo> = {
  'Seq.': 'seq',
  NIT: 'nit',
  'Código Emp.': 'codigoEmp',
  'Origem do Vínculo': 'origem',
  Trabalhador: 'matricula',
  Vínculo: 'tipoFiliado',
  'Data Início': 'dataInicio',
  'Data Fim': 'dataFim',
  'Últ. Remun.': 'ultRemun',
};

type Estado =
  | { nome: 'inicio' }
  | { nome: 'aguardando-valores-vinculo'; colunas: Coluna[] }
  | { nome: 'continuacao-vinculo'; colunas: Coluna[] }
  | { nome: 'aguardando-cabecalho-tabela' }
  | { nome: 'tabela'; colunas: Coluna[] }
  | { nome: 'pulando' }
  | { nome: 'fim' };

export function montarExtrato(itens: TextItem[]): ParseResult {
  if (!itens.some((item) => item.str === MARCA_CNIS)) {
    throw new CnisParseError(
      'NAO_E_CNIS',
      'Este PDF não parece ser um Extrato Previdenciário do CNIS. Baixe o extrato completo no portal Meu INSS.',
    );
  }

  const extrato: CnisExtrato = { filiado: {}, vinculos: [], ignorados: [] };
  const warnings: ParseWarning[] = [];
  let estado: Estado = { nome: 'inicio' };
  let vinculo: Vinculo | null = null;

  const avisar = (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) =>
    warnings.push({ codigo, pagina, seq: vinculo?.seq, detalhe });

  for (const linha of agruparEmLinhas(itens)) {
    if (estado.nome === 'fim') break;
    const tipo = classificar(linha);

    // 'ignorar' não muda estado: é o que permite a tabela continuar na página seguinte.
    if (tipo === 'ignorar') continue;

    if (tipo === 'fim') {
      estado = { nome: 'fim' };
      continue;
    }

    if (tipo === 'gerado-em') {
      extrato.geradoEm ??= linha.items[0].str;
      continue;
    }

    if (tipo === 'filiado') {
      Object.assign(extrato.filiado, extrairCamposFiliado(linha));
      continue;
    }

    if (tipo === 'cabecalho-vinculo') {
      vinculo = null;
      estado = { nome: 'aguardando-valores-vinculo', colunas: colunasDoCabecalho(linha) };
      continue;
    }

    if (tipo === 'rotulo-secao') {
      estado = vinculo ? { nome: 'aguardando-cabecalho-tabela' } : { nome: 'pulando' };
      continue;
    }

    // tipo === 'dados'
    if (estado.nome === 'aguardando-valores-vinculo') {
      const [celulas = {}] = celulasPorGrupo(linha, estado.colunas);
      const novo = construirVinculo(celulas);
      if (novo.tipoFiliado === TIPO_FILIADO_CLT || novo.tipoFiliado.startsWith('Empregado ou Agente')) {
        vinculo = novo;
        extrato.vinculos.push(novo);
      } else {
        extrato.ignorados.push({ seq: novo.seq, tipoFiliado: novo.tipoFiliado, motivo: 'NAO_CLT' });
        vinculo = null;
      }
      estado = { nome: 'continuacao-vinculo', colunas: estado.colunas };
      continue;
    }

    if (estado.nome === 'continuacao-vinculo') {
      // "Empregado ou Agente" + "Público" vêm em linhas separadas.
      const [celulas = {}] = celulasPorGrupo(linha, estado.colunas);
      const alvo = vinculo ?? extrato.ignorados.at(-1);
      if (alvo && celulas['Vínculo']) {
        const completo = `${alvo.tipoFiliado} ${celulas['Vínculo']}`.trim();
        alvo.tipoFiliado = completo;
      }
      if (vinculo && celulas['Origem do Vínculo']) {
        vinculo.origem = `${vinculo.origem ?? ''} ${celulas['Origem do Vínculo']}`.trim();
      }
      continue;
    }

    if (estado.nome === 'aguardando-cabecalho-tabela') {
      const colunas = mapearColunas(linha, COLUNAS_REMUNERACAO);
      if (!colunas) {
        avisar('LAYOUT_DESCONHECIDO', linha.page, `Cabeçalho de tabela não reconhecido: "${linha.items.map((i) => i.str).join(' | ')}"`);
        estado = { nome: 'pulando' };
        continue;
      }
      estado = { nome: 'tabela', colunas };
      continue;
    }

    if (estado.nome === 'tabela' && vinculo) {
      lerLinhaDaTabela(linha, estado.colunas, vinculo, avisar);
    }
  }

  return { extrato, warnings };
}

function construirVinculo(celulas: Record<string, string>): Vinculo {
  const vinculo: Vinculo = { seq: 0, tipoFiliado: '', remuneracoes: [] };
  for (const [rotulo, valor] of Object.entries(celulas)) {
    switch (CAMPOS_VINCULO[rotulo]) {
      case 'seq':
        vinculo.seq = Number.parseInt(valor, 10) || 0;
        break;
      case 'nit':
        vinculo.nit = valor;
        break;
      case 'codigoEmp':
        vinculo.codigoEmp = valor;
        break;
      case 'origem':
        vinculo.origem = valor;
        break;
      case 'matricula':
        vinculo.matricula = valor;
        break;
      case 'tipoFiliado':
        vinculo.tipoFiliado = valor;
        break;
      case 'dataInicio':
        vinculo.dataInicio = valor;
        break;
      case 'dataFim':
        vinculo.dataFim = valor;
        break;
      case 'ultRemun':
        vinculo.ultRemun = valor;
        break;
      default:
        break;
    }
  }
  return vinculo;
}

function lerLinhaDaTabela(
  linha: Row,
  colunas: Coluna[],
  vinculo: Vinculo,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  const grupos = celulasPorGrupo(linha, colunas);
  const comCompetencia = grupos.filter((g) => COMPETENCIA.test(g['Competência'] ?? ''));

  // Nenhuma competência válida: é fragmento de cabeçalho repetido, não dado.
  if (comCompetencia.length === 0) return;

  for (const grupo of comCompetencia) {
    const competencia = grupo['Competência'];
    const valorCentavos = parseValorCentavos(grupo['Remuneração'] ?? '');

    if (valorCentavos === null) {
      avisar('CELULA_ORFA', linha.page, `Competência ${competencia} sem remuneração legível (lido: "${grupo['Remuneração'] ?? ''}")`);
      continue;
    }
    if (vinculo.remuneracoes.some((r) => r.competencia === competencia)) {
      avisar('COMPETENCIA_DUPLICADA', linha.page, `Competência ${competencia} aparece mais de uma vez no vínculo`);
    }

    const indicadores = (grupo['Indicadores'] ?? '')
      .split(',')
      .map((i) => i.trim())
      .filter((i) => i !== '');

    vinculo.remuneracoes.push({ competencia, valorCentavos, indicadores });
  }
}

export async function parseCnis(
  data: ArrayBuffer,
  opcoes: { workerSrc?: string } = {},
): Promise<ParseResult> {
  return montarExtrato(await extrairTextLayer(data, opcoes));
}
```

- [ ] **Step 4: Criar a API pública**

Crie `src/lib/cnis/index.ts`:

```ts
export { parseCnis, montarExtrato } from './parse-cnis';
export { CnisParseError, TIPO_FILIADO_CLT } from './types';
export type {
  CnisExtrato,
  ErroCode,
  Filiado,
  ParseResult,
  ParseWarning,
  Remuneracao,
  Vinculo,
  VinculoIgnorado,
  WarningCode,
} from './types';
```

- [ ] **Step 5: Rodar a suíte completa**

```bash
rm src/lib/cnis/smoke.test.ts && npm test
```

Esperado: todos os testes passando, incluindo as condições de aceite do spec (2 vínculos, 3 ignorados, 16 e 30 competências, `codigoEmp` = `98.765.432`, zero avisos).

Se algum valor divergir, **não ajuste o teste para passar** — o teste carrega os números verificados no extrato real. Corrija a implementação.

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/cnis
git commit -m "feat(cnis): maquina de estados e API publica parseCnis"
```

---

### Task 7: Tela de upload

**Files:**
- Create: `src/components/upload-cnis.tsx`
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`
- Test: verificação manual no navegador + `npm run build` (ver Step 4)

**Interfaces:**
- Consumes: `parseCnis`, `CnisParseError`, `ParseResult` de `@/lib/cnis` (Task 6)
- Produces: a tela de F1; em F3 ela é substituída pelo dashboard, então nada de lógica de domínio aqui

Esta task não tem teste automatizado de propósito: toda a lógica está em `src/lib/cnis`, coberta pelas Tasks 2–6. A camada de UI é uma casca fina que será descartada em F3, e montar jsdom + testing-library só para ela custaria mais do que entrega. A verificação é o build mais o roteiro manual do Step 4.

- [ ] **Step 1: Escrever o componente de upload**

Crie `src/components/upload-cnis.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { CnisParseError, parseCnis, type ParseResult } from '@/lib/cnis';

type Situacao =
  | { estado: 'inicial' }
  | { estado: 'processando' }
  | { estado: 'pronto'; resultado: ParseResult }
  | { estado: 'erro'; mensagem: string };

export function UploadCnis() {
  const [situacao, setSituacao] = useState<Situacao>({ estado: 'inicial' });
  const [arrastando, setArrastando] = useState(false);

  async function processar(arquivo: File) {
    setSituacao({ estado: 'processando' });
    try {
      const resultado = await parseCnis(await arquivo.arrayBuffer());
      setSituacao({ estado: 'pronto', resultado });
    } catch (erro) {
      setSituacao({
        estado: 'erro',
        mensagem:
          erro instanceof CnisParseError
            ? erro.message
            : 'Não foi possível ler este PDF. Verifique se é o Extrato Previdenciário completo baixado no Meu INSS.',
      });
    }
  }

  function baixarJson(resultado: ParseResult) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cnis.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Calculadora de Teto Previdenciário</h1>
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Seu arquivo não sai do seu navegador: a leitura do PDF acontece no seu próprio
          dispositivo, sem envio para nenhum servidor.
        </p>
      </header>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const arquivo = e.dataTransfer.files[0];
          if (arquivo) void processar(arquivo);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition ${
          arrastando ? 'border-emerald-500 bg-emerald-50' : 'border-neutral-300'
        }`}
      >
        <span className="font-medium">Arraste aqui o PDF do seu extrato CNIS</span>
        <span className="text-sm text-neutral-500">ou clique para escolher o arquivo</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void processar(arquivo);
          }}
        />
      </label>

      {situacao.estado === 'processando' && <p role="status">Lendo o extrato…</p>}

      {situacao.estado === 'erro' && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          {situacao.mensagem}
        </p>
      )}

      {situacao.estado === 'pronto' && <Resultado resultado={situacao.resultado} onBaixar={baixarJson} />}
    </div>
  );
}

function Resultado({
  resultado,
  onBaixar,
}: {
  resultado: ParseResult;
  onBaixar: (resultado: ParseResult) => void;
}) {
  const { extrato, warnings } = resultado;
  const competencias = extrato.vinculos.reduce((total, v) => total + v.remuneracoes.length, 0);

  return (
    <section className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Filiado', extrato.filiado.nome ?? '—'],
          ['Vínculos CLT', String(extrato.vinculos.length)],
          ['Vínculos ignorados', String(extrato.ignorados.length)],
          ['Competências lidas', String(competencias)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-md border border-neutral-200 p-3">
            <dt className="text-xs uppercase text-neutral-500">{rotulo}</dt>
            <dd className="text-sm font-medium">{valor}</dd>
          </div>
        ))}
      </dl>

      {extrato.ignorados.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {extrato.ignorados.length} vínculo(s) não considerado(s) nesta versão (
          {extrato.ignorados.map((i) => `${i.seq}: ${i.tipoFiliado}`).join('; ')}). O cálculo
          cobre apenas vínculos de empregado (CLT).
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warnings.map((aviso, i) => (
            <li key={`${aviso.codigo}-${i}`}>
              <strong>{aviso.codigo}</strong> (pág. {aviso.pagina}
              {aviso.seq ? `, vínculo ${aviso.seq}` : ''}): {aviso.detalhe}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onBaixar(resultado)}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
      >
        Baixar JSON
      </button>

      <pre className="max-h-96 overflow-auto rounded-md bg-neutral-900 p-4 text-xs text-neutral-100">
        {JSON.stringify(resultado, null, 2)}
      </pre>
    </section>
  );
}
```

- [ ] **Step 2: Ligar o componente na página**

Substitua o conteúdo de `src/app/page.tsx` por:

```tsx
import { UploadCnis } from '@/components/upload-cnis';

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <UploadCnis />
    </main>
  );
}
```

Em `src/app/layout.tsx`, ajuste os metadados:

```tsx
export const metadata = {
  title: 'Calculadora de Teto Previdenciário',
  description:
    'Leia seu extrato CNIS no próprio navegador e descubra em quais meses a contribuição ao INSS passou do teto.',
};
```

- [ ] **Step 3: Verificar tipos, lint e build**

```bash
npx tsc --noEmit && npm run lint && npm run build && npm test
```

Esperado: nenhum erro de tipo, lint limpo, build concluído, suíte verde.

- [ ] **Step 4: Verificação manual no navegador**

```bash
npm run dev
```

Abra `http://localhost:3000` e confira, com `extrato-exemplo.pdf`:

1. O banner "Seu arquivo não sai do seu navegador" aparece antes de qualquer upload.
2. Arrastar o PDF para a área tracejada processa o arquivo (e clicar também abre o seletor).
3. O resumo mostra 2 vínculos CLT, 3 vínculos ignorados e 46 competências lidas. O nome exibido é o nome real do extrato local — os nomes fictícios existem só na fixture de teste.
4. Nenhum aviso é exibido.
5. "Baixar JSON" salva `cnis.json` com os mesmos dados.
6. Na aba Network do navegador, nenhuma requisição além dos assets do app e de `/pdf.worker.min.mjs` — em particular, nenhum upload do PDF.
7. Suba um PDF qualquer que não seja CNIS: a mensagem de erro explica o que baixar no Meu INSS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): tela de upload do CNIS com resumo, avisos e download do JSON"
```

---

## Checklist final de F1

- [ ] `npm test` verde, sem testes marcados como pendentes a não ser o smoke do PDF local
- [ ] `npm run build` e `npx tsc --noEmit` sem erros
- [ ] `git ls-files | grep -i pdf` não retorna `extrato-exemplo.pdf`
- [ ] Nenhuma PII real em NENHUM arquivo rastreado (o grep cobre também as formas escapadas, `\.` e `\/`; um grep ingênuo por valor literal não pega o que está escrito dentro de regex, e foi assim que a tabela de anonimização chegou a ser commitada). O comando não imprime os valores e não deve listar nenhum arquivo:

  ```bash
  node -e 'const m=require("./anonimizacao.local.json");console.log(m.flatMap(({de})=>[de,de.replace(/[.\/]/g,"\\$&")]).join("\n"))' > /tmp/pii-padroes.txt
  git ls-files -z | xargs -0 grep -ciF -f /tmp/pii-padroes.txt | grep -v ':0$'
  rm /tmp/pii-padroes.txt
  ```
- [ ] Nenhum arquivo em `src/app/api/` e nenhum `fetch(` em `src/` fora do carregamento do worker
