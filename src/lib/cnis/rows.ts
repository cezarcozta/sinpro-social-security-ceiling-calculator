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
