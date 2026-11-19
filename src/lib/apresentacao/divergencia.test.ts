import { describe, expect, it } from 'vitest';
import { textoDivergencia } from './divergencia';
import { SINDICATO } from './sindicato';
import { fontesPorCompetencia } from './fontes';
import { PARSE_GATILHOS, RESULTADO_GATILHOS } from './__fixtures__/gatilhos';

const agosto = RESULTADO_GATILHOS.competencias.find((c) => c.competencia === '08/2024')!;
const fontesDeAgosto = fontesPorCompetencia(PARSE_GATILHOS.extrato).get('08/2024')!;

describe('textoDivergencia', () => {
  const texto = textoDivergencia(agosto, fontesDeAgosto);

  it('traz a competência, o que lemos em cada fonte e o total calculado', () => {
    expect(texto).toContain('08/2024');
    expect(texto).toContain('R$ 5.000,00');
    expect(texto).toContain('R$ 4.500,00');
    expect(texto).toContain('R$ 9.500,00');
    expect(texto).toContain('R$ 58,78');
  });

  it('não traz nome, CPF nem NIT', () => {
    expect(texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(texto).not.toMatch(/\d{3}\.\d{5}\.\d{2}-\d/);
    expect(texto.toUpperCase()).not.toContain('MARIA');
  });

  it('não traz o CNPJ do empregador, que identificaria o professor', () => {
    expect(texto).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    expect(texto).toContain('fonte 1');
    expect(texto).toContain('fonte 2');
  });

  it('avisa, dentro do texto, que não contém dados de identificação', () => {
    expect(texto).toMatch(/não contém/i);
  });

  it('diz se o valor da fonte foi lido do extrato ou estimado', () => {
    const setembro = RESULTADO_GATILHOS.competencias.find((c) => c.competencia === '09/2026')!;
    const comLido = textoDivergencia(
      setembro,
      fontesPorCompetencia(PARSE_GATILHOS.extrato).get('09/2026')!,
    );
    expect(comLido).toMatch(/lido do extrato/i);
    expect(comLido).toMatch(/estimado/i);
  });
});

describe('SINDICATO', () => {
  it('nomeia o sindicato e deixa o contato explicitamente pendente', () => {
    expect(SINDICATO.nome).toBe('Sinpro-ABC');
    expect(SINDICATO.contato).toBeNull();
  });
});
