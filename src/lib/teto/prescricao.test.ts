import { describe, expect, it } from 'vitest';
import { prescricaoDe } from './prescricao';

describe('prescricaoDe', () => {
  it('conta 5 anos do vencimento do recolhimento, dia 20 do mês seguinte', () => {
    expect(prescricaoDe('01/2021', '2026-11-19')?.prescreveEm).toBe('2026-02-20');
    expect(prescricaoDe('11/2021', '2026-11-19')?.prescreveEm).toBe('2026-12-20');
  });

  it('dezembro vira o ano: competência 12/2024 recolhe em 01/2025 e prescreve em 2030', () => {
    expect(prescricaoDe('12/2024', '2026-11-19')?.prescreveEm).toBe('2030-01-20');
  });

  it('o 13º segue a competência de dezembro do mesmo ano', () => {
    expect(prescricaoDe('13/2024', '2026-11-19')?.prescreveEm).toBe('2030-01-20');
  });

  it('a virada é no dia exato: no prazo em 19/02, no prazo em 20/02, prescrito em 21/02', () => {
    expect(prescricaoDe('01/2021', '2026-02-19')?.noPrazo).toBe(true);
    expect(prescricaoDe('01/2021', '2026-02-20')?.noPrazo).toBe(true);
    expect(prescricaoDe('01/2021', '2026-02-21')?.noPrazo).toBe(false);
  });

  it('diasRestantes é a diferença em dias e fica negativo depois de prescrever', () => {
    expect(prescricaoDe('01/2021', '2026-02-10')?.diasRestantes).toBe(10);
    expect(prescricaoDe('01/2021', '2026-03-02')?.diasRestantes).toBe(-10);
  });

  it('urgente marca a faixa de até 90 dias, e só ela', () => {
    expect(prescricaoDe('01/2021', '2025-11-22')?.urgente).toBe(true); // 90 dias
    expect(prescricaoDe('01/2021', '2025-11-21')?.urgente).toBe(false); // 91 dias
    expect(prescricaoDe('01/2021', '2026-03-02')?.urgente).toBe(false); // já prescrito
  });

  it('atravessa 29 de fevereiro sem erro de um dia', () => {
    expect(prescricaoDe('01/2019', '2024-02-29')?.diasRestantes).toBe(-9);
  });

  it('rejeita dataReferencia que não seja AAAA-MM-DD, em vez de calcular com NaN', () => {
    expect(() => prescricaoDe('01/2021', '19/11/2026')).toThrow(/AAAA-MM-DD/);
  });

  it('devolve null para competência malformada', () => {
    for (const lixo of ['', '00/2024', '14/2024', '2024']) {
      expect(prescricaoDe(lixo, '2026-11-19')).toBeNull();
    }
  });
});
