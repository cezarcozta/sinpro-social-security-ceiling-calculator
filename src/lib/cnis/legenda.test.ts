import { describe, expect, it } from 'vitest';
import { agruparEmLinhas } from './rows';
import { extrairLegenda } from './legenda';
import type { TextItem } from './types';

/**
 * A legenda do extrato de exemplo, nas coordenadas reais medidas na página 5. É a mesma
 * disciplina do `extratoSintetico` do parser: geometria verdadeira, dado sintetizado.
 */
const LEGENDA_REAL: TextItem[] = [
  { page: 5, y: 103, x: 43, str: 'Identificação do Filiado' },
  { page: 5, y: 171, x: 43, str: 'Legenda de Indicadores' },
  { page: 5, y: 189, x: 69, str: 'Indicador' },
  { page: 5, y: 189, x: 150, str: 'Descrição' },
  { page: 5, y: 189, x: 459, str: 'Indicador' },
  { page: 5, y: 189, x: 540, str: 'Descrição' },
  { page: 5, y: 203, x: 57, str: 'IREC-INDPEND' },
  { page: 5, y: 203, x: 155, str: 'Recolhimentos com indicadores/pendências' },
  { page: 5, y: 203, x: 454, str: 'IREC-LC123' },
  { page: 5, y: 203, x: 555, str: 'Recolhimento no Plano Simplificado de Previdência' },
  { page: 5, y: 214, x: 555, str: 'Social (LC 123/2006)' },
  { page: 5, y: 228, x: 70, str: 'IREC-MEI' },
  { page: 5, y: 228, x: 155, str: 'Indica que a contribuição da competência foi recolhida' },
  { page: 5, y: 228, x: 447, str: 'IREM-INDPEND' },
  { page: 5, y: 228, x: 555, str: 'Remunerações com indicadores/pendências' },
  { page: 5, y: 239, x: 155, str: 'com código MEI' },
  { page: 5, y: 253, x: 45, str: 'PSC-MEN-SM-EC103' },
  { page: 5, y: 253, x: 155, str: 'Pendência na competência em que o somatório dos' },
  { page: 5, y: 264, x: 155, str: 'salários de contribuição é menor que o mínimo.' },
  { page: 5, y: 274, x: 155, str: 'Competência pode ser passível de complementação,' },
  { page: 5, y: 285, x: 155, str: 'utilização ou agrupamento, de acordo com a EC' },
  { page: 5, y: 295, x: 155, str: '103/2019.' },
  { page: 5, y: 482, x: 125, str: 'Você pode conferir a autenticidade do documento em' },
  { page: 5, y: 493, x: 125, str: 'https://meu.inss.gov.br/central/#/autenticidade' },
];

const legendaDe = (itens: TextItem[]) => extrairLegenda(agruparEmLinhas(itens));

describe('extrairLegenda', () => {
  const legenda = legendaDe(LEGENDA_REAL);
  const descricaoDe = (codigo: string) => legenda.find((l) => l.codigo === codigo)?.descricao;

  it('lê os cinco indicadores das duas colunas, sem perder nenhum', () => {
    expect(legenda.map((l) => l.codigo).sort()).toEqual([
      'IREC-INDPEND',
      'IREC-LC123',
      'IREC-MEI',
      'IREM-INDPEND',
      'PSC-MEN-SM-EC103',
    ]);
  });

  it('junta a descrição que o PDF quebrou em várias linhas', () => {
    expect(descricaoDe('IREC-LC123')).toBe(
      'Recolhimento no Plano Simplificado de Previdência Social (LC 123/2006)',
    );
    expect(descricaoDe('IREC-MEI')).toBe(
      'Indica que a contribuição da competência foi recolhida com código MEI',
    );
    expect(descricaoDe('PSC-MEN-SM-EC103')).toBe(
      'Pendência na competência em que o somatório dos salários de contribuição é menor que o mínimo. Competência pode ser passível de complementação, utilização ou agrupamento, de acordo com a EC 103/2019.',
    );
  });

  it('não deixa a continuação da coluna da esquerda vazar para a da direita', () => {
    // y=228 tem IREC-MEI à esquerda e IREM-INDPEND à direita; a continuação "com código
    // MEI" (y=239) é só da esquerda.
    expect(descricaoDe('IREM-INDPEND')).toBe('Remunerações com indicadores/pendências');
  });

  it('para no rodapé de autenticidade, que não é descrição de indicador', () => {
    expect(JSON.stringify(legenda)).not.toContain('autenticidade');
  });

  it('devolve lista vazia quando o extrato não tem legenda', () => {
    expect(legendaDe(LEGENDA_REAL.filter((i) => i.y < 171))).toEqual([]);
  });

  it('ignora a mobília de página quando a legenda atravessa a quebra', () => {
    const continua: TextItem[] = [
      ...LEGENDA_REAL.filter((i) => i.y <= 214),
      { page: 6, y: 32, x: 746, str: 'Página 6 de 6' },
      { page: 6, y: 45, x: 407, str: 'INSS' },
      { page: 6, y: 103, x: 43, str: 'Identificação do Filiado' },
      { page: 6, y: 121, x: 25, str: 'NIT:' },
      { page: 6, y: 121, x: 55, str: '987.65432.10-9' },
      { page: 6, y: 203, x: 70, str: 'PREM-EXT' },
      { page: 6, y: 203, x: 155, str: 'Remuneração extemporânea' },
    ];
    expect(legendaDe(continua).find((l) => l.codigo === 'PREM-EXT')?.descricao).toBe(
      'Remuneração extemporânea',
    );
  });
});
