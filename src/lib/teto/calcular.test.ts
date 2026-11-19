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
