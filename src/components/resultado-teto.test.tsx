// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TelasDoResultado } from './resultado-teto';
import { PARSE_GATILHOS, RESULTADO_GATILHOS } from '@/lib/apresentacao/__fixtures__/gatilhos';

afterEach(cleanup);

function montar() {
  render(<TelasDoResultado parse={PARSE_GATILHOS} teto={RESULTADO_GATILHOS} />);
}

describe('TelasDoResultado', () => {
  it('começa no veredito', () => {
    montar();
    expect(screen.getByText(/Você está pagando INSS a mais/i)).toBeTruthy();
    expect(screen.queryByText(/Confira mês a mês/i)).toBeNull();
  });

  it('a tela de resultado não despeja JSON nem oferece download do extrato', () => {
    montar();
    expect(screen.queryByText(/json/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /baixar/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /mês a mês/i }));
    expect(screen.queryByText(/json/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /baixar/i })).toBeNull();
  });

  it('vai para a conferência e volta ao resumo', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /mês a mês/i }));
    expect(screen.getByText(/Confira mês a mês/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(screen.getByText(/Você está pagando INSS a mais/i)).toBeTruthy();
  });

  it('marcar "não bate" tira o mês do total a pedir, e a marca sobrevive à ida e volta', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /mês a mês/i }));

    const agosto = screen.getByRole('group', { name: /08\/2024/ });
    fireEvent.click(within(agosto).getByRole('radio', { name: /não bate/i }));
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));

    // 230,30 menos os 58,78 de 08/2024
    expect(screen.getByText('R$ 171,52')).toBeTruthy();
    expect(screen.queryByText('R$ 230,30')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /mês a mês/i }));
    const outraVez = screen.getByRole('group', { name: /08\/2024/ });
    expect(
      (within(outraVez).getByRole('radio', { name: /não bate/i }) as HTMLInputElement).checked,
    ).toBe(true);
  });
});
