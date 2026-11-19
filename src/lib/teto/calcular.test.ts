import { describe, expect, it } from 'vitest';
import fixture from '../cnis/__fixtures__/extrato-exemplo.textlayer.json';
import { montarExtrato } from '../cnis/parse-cnis';
import type { CnisExtrato, Contribuicao, Remuneracao, TextItem, Vinculo } from '../cnis/types';
import { calcularTeto } from './calcular';

const HOJE = '2026-11-19';

const extratoCom = (...vinculos: Vinculo[]): CnisExtrato => ({ filiado: {}, vinculos });
const rem = (competencia: string, valorCentavos: number): Remuneracao => ({
  competencia,
  valorCentavos,
  indicadores: [],
});
const clt = (seq: number, ...remuneracoes: Remuneracao[]): Vinculo => ({
  seq,
  tipoFiliado: 'Empregado ou Agente Público',
  natureza: 'CLT',
  remuneracoes,
});
const proprio = (seq: number, ...contribuicoes: Contribuicao[]): Vinculo => ({
  seq,
  tipoFiliado: 'Contribuinte Individual',
  natureza: 'CI_PROPRIO',
  contribuicoes,
});

const extratoCom2024 = extratoCom(clt(1, rem('08/2024', 500000)), clt(2, rem('08/2024', 450000)));

// --- camada de texto sintética, para exercitar o caminho PDF -> CnisExtrato -> motor ---
const MARCA = 'CNIS - Cadastro Nacional de Informações Sociais';
type Celula = [x: number, str: string];

const camadaDeTexto = (linhas: Array<[y: number, celulas: Celula[]]>): TextItem[] => {
  const itens: TextItem[] = [{ page: 1, x: 280, y: 59, str: MARCA }];
  for (const [y, celulas] of linhas) for (const [x, str] of celulas) itens.push({ page: 1, x, y, str });
  return itens;
};

const cabecalhoVinculo = (y: number): [number, Celula[]] => [
  y,
  [[35, 'Seq.'], [87, 'NIT'], [152, 'Código Emp.'], [301, 'Origem do Vínculo'], [475, 'Trabalhador'],
   [582, 'Tipo Filiado no Vínculo'], [650, 'Data Início'], [705, 'Data Fim'], [755, 'Últ. Remun.']],
];
const linhaVinculo = (y: number, seq: string, tipo: string): [number, Celula[]] => [
  y,
  [[42, seq], [67, '123.45678.90-1'], [139, '12.345.678/0001-95'], [287, 'COLEGIO ALFA'],
   [554, tipo], [651, '01/2024'], [702, '12/2024'], [765, '12/2024']],
];
const cabecalhoClt = (y: number): [number, Celula[]] => [
  y,
  [[43, 'Competência'], [131, 'Remuneração'], [221, 'Indicadores']],
];
const cabecalhoProprio = (y: number): [number, Celula[]] => [
  y,
  [[43, 'Competência'], [120, 'Data Pgto.'], [200, 'Contribuição'], [300, 'Salário Contribuição'], [420, 'Indicadores']],
];

describe('calcularTeto', () => {
  it('monta a competência completa do exemplo da spec', () => {
    const r = calcularTeto(extratoCom2024, HOJE);
    expect(r.competencias[0]).toMatchObject({
      competencia: '08/2024',
      decimoTerceiro: false,
      tetoCentavos: 778602,
      somaBaseCentavos: 950000,
      excedeuTeto: true,
      baseExcedenteCentavos: 171398, // aritmética exata: soma − teto
      retidoAMaiorCentavos: 5878, // estimativa
      multiplosVinculos: true,
    });
  });

  it('competência fora de 2021–2026 sai em ignoradasSemTabela e não entra em total nenhum', () => {
    const r = calcularTeto(extratoCom(clt(1, rem('06/2008', 900000))), HOJE);
    expect(r.ignoradasSemTabela).toContain('06/2008');
    expect(r.competencias.map((c) => c.competencia)).not.toContain('06/2008');
    expect(r.resumo.totalAPedirCentavos).toBe(0);
  });

  it('separa o total a pedir do total prescrito pela elegibilidade de cada mês', () => {
    const r = calcularTeto(
      extratoCom(
        clt(1, rem('01/2021', 400000), rem('01/2026', 500000)),
        clt(2, rem('01/2021', 400000), rem('01/2026', 500000)),
      ),
      HOJE,
    );
    expect(r.resumo.totalAPedirCentavos).toBeGreaterThan(0);
    expect(r.resumo.totalPrescritoCentavos).toBeGreaterThan(0);
    expect(r.competencias.find((c) => c.competencia === '01/2021')!.prescricao.noPrazo).toBe(false);
    expect(r.competencias.find((c) => c.competencia === '01/2026')!.prescricao.noPrazo).toBe(true);
  });

  it('mesesAcimaDoTeto e mesesComMultiplosVinculos contam competências distintas, não registros', () => {
    const r = calcularTeto(extratoCom2024, HOJE);
    expect(r.resumo.mesesComMultiplosVinculos).toBe(1);
    expect(r.resumo.mesesAcimaDoTeto).toBe(1);
  });

  it('o 13º entra como competência própria e não soma com dezembro', () => {
    const r = calcularTeto(extratoCom(clt(1, rem('12/2024', 500000), rem('13/2024', 500000))), HOJE);
    const treze = r.competencias.find((c) => c.competencia === '13/2024')!;
    expect(treze.decimoTerceiro).toBe(true);
    expect(treze.tetoCentavos).toBe(778602);
    expect(treze.somaBaseCentavos).toBe(500000); // só a gratificação
  });

  it('MEI com a margem já esgotada gera o achado MEI_DAS_INDEVIDO, fora do total geral', () => {
    const r = calcularTeto(
      extratoCom(
        clt(1, rem('08/2026', 900000)),
        proprio(2, {
          competencia: '08/2026',
          contribuicaoCentavos: 8105,
          salarioContribuicaoCentavos: 162100,
          indicadores: ['IREC-MEI'],
        }),
      ),
      HOJE,
    );
    const achado = r.achados.find((a) => a.tipo === 'MEI_DAS_INDEVIDO')!;
    expect(achado.competencias).toEqual(['08/2026']);
    expect(achado.valorCentavos).toBe(8105);
    expect(r.resumo.totalAPedirCentavos).not.toBe(achado.valorCentavos);
    expect(r.resumo.totalAPedirCentavos).toBe(0);
  });

  it('um vínculo com duas guias no mesmo mês não é "múltiplos vínculos"', () => {
    const r = calcularTeto(
      extratoCom(
        proprio(
          1,
          { competencia: '08/2024', contribuicaoCentavos: 20900, salarioContribuicaoCentavos: 104500, indicadores: [] },
          { competencia: '08/2024', contribuicaoCentavos: 20900, salarioContribuicaoCentavos: 104500, indicadores: [] },
        ),
      ),
      HOJE,
    );
    // duas guias somam de verdade, mas a fonte pagadora é UMA: a F4 declara ao RH que há
    // outra fonte, e esse número não pode vir de duas linhas do mesmo vínculo
    expect(r.competencias[0].multiplosVinculos).toBe(false);
    expect(r.resumo.mesesComMultiplosVinculos).toBe(0);
  });

  it('rejeita dataReferencia impossível em vez de rolar a data em silêncio', () => {
    const vazio: CnisExtrato = { filiado: {}, vinculos: [] };
    expect(() => calcularTeto(vazio, '2026-99-99')).toThrow(/dataReferencia/);
    expect(() => calcularTeto(vazio, '2026-02-30')).toThrow(/dataReferencia/);
    expect(() => calcularTeto(vazio, 'ontem')).toThrow(/dataReferencia/);
  });

  it('calcula dinheiro a partir de um extrato que o PARSER montou, não de literais', () => {
    const itens = camadaDeTexto([
      cabecalhoVinculo(200),
      linhaVinculo(214, '1', 'Empregado ou Agente Público'),
      [240, [[54, 'Remunerações']]],
      cabecalhoClt(255),
      [270, [[43, '08/2024'], [131, '5.000,00']]],
      cabecalhoVinculo(300),
      linhaVinculo(314, '2', 'Empregado ou Agente Público'),
      [340, [[54, 'Remunerações']]],
      cabecalhoClt(355),
      [370, [[43, '08/2024'], [131, '4.500,00']]],
      cabecalhoVinculo(400),
      linhaVinculo(414, '3', 'Contribuinte Individual'),
      [440, [[54, 'Contribuições']]],
      cabecalhoProprio(455),
      [470, [[43, '08/2024'], [120, '15/09/2024'], [200, '70,60'], [300, '1.412,00'], [430, 'IREC-MEI']]],
    ]);

    const { extrato } = montarExtrato(itens);
    expect(extrato.vinculos.map((v) => v.natureza)).toEqual(['CLT', 'CLT', 'CI_PROPRIO']);

    const r = calcularTeto(extrato, HOJE);
    expect(r.competencias).toHaveLength(1);
    const c = r.competencias[0];
    expect(c.competencia).toBe('08/2024');
    expect(c.multiplosVinculos).toBe(true);
    expect(c.camadas.map((x) => x.natureza)).toEqual(['CLT', 'CI_PROPRIO']);
    expect(c.retidoAMaiorCentavos).toBe(5878); // os dois CLT; o DAS do MEI não entra aqui
    expect(r.achados).toEqual([{ tipo: 'MEI_DAS_INDEVIDO', competencias: ['08/2024'], valorCentavos: 7060 }]);
    expect(r.resumo.totalAPedirCentavos).toBe(5878);
  });

  it('propaga os avisos das camadas inferiores, nunca os engole', () => {
    const r = calcularTeto(extratoCom(clt(1, rem('08/2024', 500000), rem('08/2024', 500000))), HOJE);
    expect(r.avisos.map((a) => a.codigo)).toContain('DUPLICADA_DESCARTADA');
  });

  it('extrato vazio devolve resultado válido e zerado', () => {
    const r = calcularTeto({ filiado: {}, vinculos: [] }, HOJE);
    expect(r.competencias).toEqual([]);
    expect(r.resumo).toEqual({
      mesesComMultiplosVinculos: 0,
      mesesAcimaDoTeto: 0,
      totalAPedirCentavos: 0,
      totalPrescritoCentavos: 0,
    });
  });

  it('devolve a dataReferencia que recebeu e nunca consulta o relógio', () => {
    expect(calcularTeto(extratoCom2024, HOJE).dataReferencia).toBe(HOJE);
  });

  it('todo campo *Centavos da saída é inteiro', () => {
    const { extrato } = montarExtrato(fixture as TextItem[]);
    const alvos = [calcularTeto(extrato, HOJE), calcularTeto(extratoCom2024, HOJE)];
    let conferidos = 0;

    const varrer = (valor: unknown): void => {
      if (Array.isArray(valor)) return valor.forEach(varrer);
      if (valor === null || typeof valor !== 'object') return;
      for (const [chave, v] of Object.entries(valor)) {
        if (chave.endsWith('Centavos')) {
          expect(Number.isInteger(v), `${chave} = ${v}`).toBe(true);
          conferidos += 1;
        }
        varrer(v);
      }
    };

    alvos.forEach(varrer);
    expect(conferidos).toBeGreaterThan(0);
  });

  it('roda sobre o extrato real da fixture da F1 sem exceção', () => {
    const { extrato } = montarExtrato(fixture as TextItem[]);
    const r = calcularTeto(extrato, HOJE);
    expect(r.competencias.length + r.ignoradasSemTabela.length).toBeGreaterThan(0);
  });
});
