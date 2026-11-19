import { describe, expect, it } from 'vitest';
import { formatarCentavos } from './dinheiro';

describe('formatarCentavos', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatarCentavos(0)).toBe('R$ 0,00');
    expect(formatarCentavos(1)).toBe('R$ 0,01');
    expect(formatarCentavos(5878)).toBe('R$ 58,78');
    expect(formatarCentavos(284119)).toBe('R$ 2.841,19');
    expect(formatarCentavos(100000000)).toBe('R$ 1.000.000,00');
  });

  it('formata negativo com sinal, em vez de quebrar a tela', () => {
    expect(formatarCentavos(-5878)).toBe('-R$ 58,78');
  });

  it('lança em entrada não inteira, que é erro de programação', () => {
    expect(() => formatarCentavos(58.78)).toThrow(RangeError);
  });
});
