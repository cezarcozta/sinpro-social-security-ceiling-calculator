import { describe, expect, it } from 'vitest';
import { aplicar, bpsDe, confere, contribuicao } from './aliquotas';
import { tabelaDe } from './tabelas';

const T2024 = tabelaDe('08/2024')!; // teto 778602

describe('contribuicao (oráculo externo)', () => {
  it('reproduz os valores publicados para a tabela de 2024', () => {
    expect(contribuicao(500000, T2024)).toBe(51882); // R$ 5.000,00 -> 518,82
    expect(contribuicao(450000, T2024)).toBe(44882); // R$ 4.500,00 -> 448,82
    expect(contribuicao(220000, T2024)).toBe(17682); // R$ 2.200,00 -> 176,82
    expect(contribuicao(778602, T2024)).toBe(90886); // no teto     -> 908,86
  });

  it('a base no limite exato de faixa e a um centavo de cada lado', () => {
    expect(contribuicao(141200, T2024)).toBe(10590);
    expect(contribuicao(141199, T2024)).toBe(10590); // 10589,925 -> meio-para-cima
    expect(contribuicao(141201, T2024)).toBe(10590);
  });

  it('base zero dá zero', () => expect(contribuicao(0, T2024)).toBe(0));

  it('é monotônica e sempre inteira ao longo de toda a tabela', () => {
    let anterior = -1;
    for (let base = 0; base <= T2024.tetoCentavos; base += 997) {
      const v = contribuicao(base, T2024);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(anterior);
      anterior = v;
    }
  });
});

describe('aplicar', () => {
  it('arredonda meio-para-cima e devolve inteiro', () => {
    expect(aplicar(100, 1100)).toBe(11);
    expect(aplicar(50, 1100)).toBe(6); // 5,5 -> 6
    expect(aplicar(278602, 1100)).toBe(30646); // 306,4622 -> 306,46
    expect(aplicar(140000, 1100)).toBe(15400); // R$ 1.400,00 -> 154,00
  });

  it('aguenta o maior produto possível do motor sem perder precisão', () => {
    expect(aplicar(847555, 1400)).toBe(118658); // 847555*1400 = 1.186.577.000
  });
});

describe('bpsDe', () => {
  it('extrai a alíquota efetiva do par de cifras do recolhimento próprio', () => {
    expect(bpsDe(5225, 104500)).toBe(500); // 52,25 / 1.045,00 = 5%
    expect(bpsDe(11495, 104500)).toBe(1100);
    expect(bpsDe(20900, 104500)).toBe(2000);
  });

  it('devolve 0 quando a base é zero ou negativa, nunca Infinity ou NaN', () => {
    expect(bpsDe(5225, 0)).toBe(0);
    expect(bpsDe(5225, -1)).toBe(0);
  });
});

describe('confere', () => {
  it('aceita divergência de até um centavo e rejeita acima disso', () => {
    expect(confere(5225, 104500, 500)).toBe(true);
    expect(confere(5226, 104500, 500)).toBe(true);
    expect(confere(5227, 104500, 500)).toBe(false);
  });
});
