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
