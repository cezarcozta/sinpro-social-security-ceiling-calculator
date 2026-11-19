import { describe, expect, it } from 'vitest';
import { dataReferenciaLocal } from './data';

describe('dataReferenciaLocal', () => {
  it('usa a data local, não a UTC', () => {
    // 19/11/2026 às 23h30 em São Paulo já é 20/11 em UTC. Prescrição se decide no dia,
    // então um dia de erro aqui tira ou acrescenta um mês inteiro de prazo.
    expect(dataReferenciaLocal(new Date(2026, 10, 19, 23, 30))).toBe('2026-11-19');
  });

  it('preenche mês e dia com zero à esquerda', () => {
    expect(dataReferenciaLocal(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});
