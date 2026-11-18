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
