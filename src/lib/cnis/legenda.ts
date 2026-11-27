import { textoDaLinha } from './rows';
import { classificar } from './sections';
import type { LegendaIndicador, Row, TextItem } from './types';

/**
 * A seção "Legenda de Indicadores", que o extrato traz na última página.
 *
 * É a melhor fonte que este projeto tem para o significado dos indicadores do INSS, e ela
 * chega de graça: o próprio documento descreve **exatamente** os códigos que usa, escrito
 * pelo INSS, para aquele extrato. Um dicionário nosso cobriria só os códigos já vistos e
 * envelheceria em silêncio quando o INSS criasse outro; a legenda não tem esses dois
 * problemas.
 *
 * O parser de vínculos trata `Legenda de Indicadores` como fim de varredura
 * (`sections.ts`). Esta função faz a passada separada, sobre as mesmas linhas, porque a
 * legenda não tem nada a ver com a máquina de estados dos vínculos — misturar as duas só
 * acoplaria uma à outra.
 *
 * Ausência de legenda **não é erro**: extrato de layout antigo pode não trazê-la, e a tela
 * cai no código cru. Por isso o retorno é lista vazia, e não aviso.
 */

/** Um código de indicador: maiúsculas, dígitos e hífen, sem espaço. Ex.: `PSC-MEN-SM-EC103`. */
const CODIGO = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;

const TITULO = 'Legenda de Indicadores';

/**
 * Folga em x para dizer que um item está na coluna de descrição. As descrições começam
 * todas no mesmo x (o texto é alinhado à esquerda), então a folga é pequena de propósito:
 * é ela que impede o rodapé de autenticidade, alguns pixels à esquerda, de ser lido como
 * continuação da última descrição.
 *
 * A coluna é medida na **primeira descrição lida**, não no rótulo `Descrição` do
 * cabeçalho: os dois não coincidem (no extrato de exemplo o rótulo da direita está em 540
 * e o texto em 555), e confiar no rótulo perdia toda continuação daquela coluna.
 */
const TOLERANCIA_X = 8;

/** Mobília de página: não encerra a legenda, que pode atravessar a quebra. */
const MOBILIA = new Set(['ignorar', 'filiado', 'gerado-em', 'fim']);

type Par = { indicadorX: number; descricaoX: number; limite: number };

/**
 * A legenda é uma tabela de dois pares indicador/descrição lado a lado. Os pares saem do
 * cabeçalho, não de posições fixas: o código é centralizado na célula (um `IREC-MEI` e um
 * `PSC-MEN-SM-EC103` não começam no mesmo x), então só a descrição serve de âncora.
 */
function paresDoCabecalho(linha: Row): Par[] {
  const itens = linha.items;
  const pares: { indicadorX: number; descricaoX: number }[] = [];
  for (let i = 0; i < itens.length - 1; i++) {
    if (itens[i].str === 'Indicador' && itens[i + 1].str === 'Descrição') {
      pares.push({ indicadorX: itens[i].x, descricaoX: itens[i + 1].x });
      i++;
    }
  }
  if (pares.length === 0) return [];

  // A fronteira entre dois pares fica no meio do vão: depois da descrição de um, antes do
  // indicador do seguinte.
  return pares.map((par, i) => {
    const proximo = pares[i + 1];
    return {
      ...par,
      limite: proximo ? (par.descricaoX + proximo.indicadorX) / 2 : Infinity,
    };
  });
}

const parDoItem = (pares: Par[], item: TextItem): number =>
  pares.findIndex((p) => item.x < p.limite);

export function extrairLegenda(linhas: Row[]): LegendaIndicador[] {
  const inicio = linhas.findIndex((l) => textoDaLinha(l) === TITULO);
  if (inicio === -1) return [];

  let pares: Par[] = [];
  let primeiraLinhaDeDado = -1;
  for (let i = inicio + 1; i < linhas.length; i++) {
    const candidatos = paresDoCabecalho(linhas[i]);
    if (candidatos.length > 0) {
      pares = candidatos;
      primeiraLinhaDeDado = i + 1;
      break;
    }
    if (!MOBILIA.has(classificar(linhas[i]))) break;
  }
  if (pares.length === 0) return [];

  const legenda: LegendaIndicador[] = [];
  const porCodigo = new Map<string, LegendaIndicador>();
  // Qual indicador cada coluna está descrevendo agora: é o que permite a descrição
  // continuar na linha de baixo sem vazar para a coluna vizinha.
  const emAberto = new Map<number, string>();
  // Onde começa o texto da descrição de cada coluna, medido na primeira que aparecer.
  const colunaDescricao = new Map<number, number>();

  for (let i = primeiraLinhaDeDado; i < linhas.length; i++) {
    const linha = linhas[i];
    if (MOBILIA.has(classificar(linha))) continue;

    let aproveitou = false;
    for (const item of linha.items) {
      const p = parDoItem(pares, item);
      if (p === -1) continue;
      const par = pares[p];
      const medida = colunaDescricao.get(p);

      const ehCodigo =
        CODIGO.test(item.str) &&
        (medida === undefined ? item.x < par.descricaoX : item.x < medida - TOLERANCIA_X);

      if (ehCodigo) {
        emAberto.set(p, item.str);
        if (!porCodigo.has(item.str)) {
          const entrada = { codigo: item.str, descricao: '' };
          porCodigo.set(item.str, entrada);
          legenda.push(entrada);
        }
        aproveitou = true;
        continue;
      }

      if (medida !== undefined && Math.abs(item.x - medida) > TOLERANCIA_X) continue;

      const codigo = emAberto.get(p);
      const entrada = codigo === undefined ? undefined : porCodigo.get(codigo);
      if (!entrada) continue;

      colunaDescricao.set(p, medida ?? item.x);
      entrada.descricao = entrada.descricao === '' ? item.str : `${entrada.descricao} ${item.str}`;
      aproveitou = true;
    }

    // Linha que não contribuiu com nada já não é legenda: é o rodapé da página, ou o que
    // vier depois dele. Parar aqui é o que impede o aviso de autenticidade de virar
    // descrição do último indicador.
    if (!aproveitou) break;
  }

  return legenda.filter((l) => l.descricao !== '');
}
