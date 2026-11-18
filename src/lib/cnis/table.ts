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
export function celulasPorGrupo(linha: Row, colunasEntrada: Coluna[]): Array<Record<string, string>> {
  if (colunasEntrada.length === 0) return [];
  // As fronteiras só fazem sentido com as colunas em ordem de x, venham como vierem.
  const colunas = [...colunasEntrada].sort((a, b) => a.x - b.x);
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
