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
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = opcoes.workerSrc ?? '/pdf.worker.min.mjs';

  const tarefa = pdfjs.getDocument({ data: new Uint8Array(data) });
  let doc;
  try {
    doc = await tarefa.promise;
  } catch (erro) {
    try {
      await tarefa.destroy();
    } catch {
      // Falha ao liberar o worker não pode mascarar o erro original (ex.: PDF protegido por senha).
    }
    if (erro instanceof Error && erro.name === 'PasswordException') {
      throw new CnisParseError('PDF_PROTEGIDO', 'O PDF está protegido por senha.');
    }
    throw erro;
  }

  try {
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
  } finally {
    // Libera o worker em qualquer caminho (sucesso, erro ou PDF sem texto).
    await tarefa.destroy();
  }
}
