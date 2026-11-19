import { describe, expect, it } from 'vitest';
import { derivarVeredito } from './veredito';
import { RESULTADO_GATILHOS, RESULTADO_VAZIO } from './__fixtures__/gatilhos';
import type { ResultadoCompetencia, ResultadoTeto } from '@/lib/teto';

/** Competência mínima, só com o que o veredito olha. */
function comp(
  competencia: string,
  opcoes: { excesso?: number; noPrazo?: boolean; urgente?: boolean } = {},
): ResultadoCompetencia {
  const excesso = opcoes.excesso ?? 0;
  return {
    competencia,
    decimoTerceiro: competencia.startsWith('13/'),
    tetoCentavos: 847555,
    somaBaseCentavos: 900000,
    excedeuTeto: excesso > 0,
    baseExcedenteCentavos: excesso > 0 ? 52445 : 0,
    retidoCentavos: 90000,
    devidoCentavos: 90000 - excesso,
    retidoAMaiorCentavos: excesso,
    camadas: [
      {
        natureza: 'CLT',
        baseCentavos: 900000,
        retidoCentavos: 90000,
        devidoCentavos: 90000 - excesso,
        lido: false,
      },
    ],
    multiplosVinculos: true,
    prescricao: {
      prescreveEm: '2031-10-20',
      noPrazo: opcoes.noPrazo ?? true,
      diasRestantes: 1796,
      urgente: opcoes.urgente ?? false,
    },
  };
}

function teto(competencias: ResultadoCompetencia[], dataReferencia = '2026-11-19'): ResultadoTeto {
  return { ...RESULTADO_VAZIO, dataReferencia, competencias };
}

describe('derivarVeredito — a sangria atual', () => {
  it('último mês com excesso vira sangria ativa, com o mês nomeado', () => {
    const { sangria } = derivarVeredito(teto([comp('08/2026'), comp('09/2026', { excesso: 11842 })]), {});
    expect(sangria).toEqual({
      tipo: 'ativa',
      competencia: '09/2026',
      centavos: 11842,
      defasado: false,
    });
  });

  it('último mês zero, com excesso nos 12 meses anteriores, vira sangria recente', () => {
    const { sangria } = derivarVeredito(
      teto([comp('03/2026', { excesso: 5000 }), comp('09/2026')]),
      {},
    );
    expect(sangria).toEqual({ tipo: 'recente', competencia: '09/2026' });
  });

  it('excesso antigo, fora da janela de 12 meses, não vira sangria recente', () => {
    const { sangria } = derivarVeredito(
      teto([comp('01/2024', { excesso: 5000 }), comp('09/2026')]),
      {},
    );
    expect(sangria.tipo).toBe('nenhuma');
  });

  it('último mês marcado "não bate" vira divergente, e a cifra não sai', () => {
    const { sangria } = derivarVeredito(teto([comp('09/2026', { excesso: 11842 })]), {
      '09/2026': 'naoBate',
    });
    expect(sangria).toEqual({ tipo: 'divergente', competencia: '09/2026' });
  });

  it('nunca houve excesso: sangria nenhuma', () => {
    expect(derivarVeredito(teto([comp('08/2026'), comp('09/2026')]), {}).sangria.tipo).toBe(
      'nenhuma',
    );
  });

  it('13º no fim do extrato não é a última competência', () => {
    const { sangria } = derivarVeredito(
      teto([comp('11/2025', { excesso: 700 }), comp('13/2025', { excesso: 900 })]),
      {},
    );
    expect(sangria).toMatchObject({ tipo: 'ativa', competencia: '11/2025', centavos: 700 });
  });

  it('extrato mais de 4 meses atrás marca defasado', () => {
    const { sangria } = derivarVeredito(teto([comp('06/2026', { excesso: 11842 })]), {});
    expect(sangria).toMatchObject({ tipo: 'ativa', defasado: true });
  });

  it('extrato de 4 meses atrás ainda não é defasado', () => {
    const { sangria } = derivarVeredito(teto([comp('07/2026', { excesso: 11842 })]), {});
    expect(sangria).toMatchObject({ tipo: 'ativa', defasado: false });
  });

  it('competências fora de ordem não mudam a escolha da última', () => {
    const { sangria } = derivarVeredito(
      teto([comp('09/2026', { excesso: 11842 }), comp('02/2026', { excesso: 1 })]),
      {},
    );
    expect(sangria).toMatchObject({ competencia: '09/2026' });
  });

  it('sem competência nenhuma é nadaAvaliado, não veredito limpo', () => {
    expect(derivarVeredito(RESULTADO_VAZIO, {}).sangria.tipo).toBe('nadaAvaliado');
  });

  it('tudo fora do período coberto também é nadaAvaliado', () => {
    const fora: ResultadoTeto = {
      ...RESULTADO_VAZIO,
      ignoradasSemTabela: ['01/2015', '02/2015'],
    };
    expect(derivarVeredito(fora, {}).sangria.tipo).toBe('nadaAvaliado');
  });

  it('data de referência décadas à frente não esconde mês no prazo: quem decide é o motor', () => {
    const { sangria, acumulado } = derivarVeredito(
      teto([comp('09/2026', { excesso: 11842 })], '2099-01-01'),
      {},
    );
    expect(sangria).toMatchObject({ tipo: 'ativa', defasado: true });
    expect(acumulado.totalAPedirCentavos).toBe(11842);
  });
});

describe('derivarVeredito — o acumulado', () => {
  it('sem nenhuma marca, os totais recompostos são idênticos ao resumo do motor', () => {
    const { acumulado } = derivarVeredito(RESULTADO_GATILHOS, {});
    expect(acumulado.totalAPedirCentavos).toBe(RESULTADO_GATILHOS.resumo.totalAPedirCentavos);
    expect(acumulado.totalPrescritoCentavos).toBe(
      RESULTADO_GATILHOS.resumo.totalPrescritoCentavos,
    );
  });

  it('conta meses a pedir, prescritos e urgentes', () => {
    const { acumulado } = derivarVeredito(RESULTADO_GATILHOS, {});
    expect(acumulado.mesesAPedir).toBe(4);
    expect(acumulado.mesesPrescritos).toBe(1);
    expect(acumulado.mesesUrgentes).toBe(1);
  });

  it('mês sem marca conta normalmente', () => {
    const { acumulado } = derivarVeredito(RESULTADO_GATILHOS, { '08/2024': 'bate' });
    expect(acumulado.totalAPedirCentavos).toBe(23030);
  });

  it('"não bate" num mês no prazo sai do total a pedir e vai para os divergentes', () => {
    const { acumulado } = derivarVeredito(RESULTADO_GATILHOS, { '08/2024': 'naoBate' });
    expect(acumulado.totalAPedirCentavos).toBe(23030 - 5878);
    expect(acumulado.mesesAPedir).toBe(3);
    expect(acumulado.competenciasDivergentes).toEqual(['08/2024']);
  });

  it('"não bate" num mês prescrito desconta do prescrito, não do total a pedir', () => {
    const { acumulado } = derivarVeredito(RESULTADO_GATILHOS, { '02/2021': 'naoBate' });
    expect(acumulado.totalPrescritoCentavos).toBe(0);
    expect(acumulado.totalAPedirCentavos).toBe(23030);
    expect(acumulado.competenciasDivergentes).toEqual(['02/2021']);
  });

  it('múltiplos vínculos vem do motor, não é recomposto pela marca', () => {
    const { mesesComMultiplosVinculos } = derivarVeredito(RESULTADO_GATILHOS, {
      '08/2024': 'naoBate',
    });
    expect(mesesComMultiplosVinculos).toBe(6);
  });
});
