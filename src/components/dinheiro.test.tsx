// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Dinheiro } from './dinheiro';

afterEach(cleanup);

describe('Dinheiro', () => {
  it('mostra o valor com o rótulo da natureza, em texto', () => {
    render(<Dinheiro centavos={5878} natureza="estimado" elegibilidade="noPrazo" />);
    expect(screen.getByText('R$ 58,78')).toBeTruthy();
    expect(screen.getByText(/estimado/i)).toBeTruthy();
    expect(screen.getByText(/no prazo/i)).toBeTruthy();
  });

  it('distingue lido de estimado por texto, não só por cor', () => {
    render(<Dinheiro centavos={7590} natureza="lido" elegibilidade="naoSeAplica" />);
    expect(screen.getByText(/lido do extrato/i)).toBeTruthy();
    expect(screen.queryByText(/estimado/i)).toBeNull();
  });

  it('marca a aritmética exata, que não é estimativa', () => {
    render(<Dinheiro centavos={171398} natureza="exato" elegibilidade="naoSeAplica" />);
    expect(screen.getByText('R$ 1.713,98')).toBeTruthy();
    expect(screen.getByText(/exato/i)).toBeTruthy();
  });

  it('marca prescrito junto do valor', () => {
    render(<Dinheiro centavos={41207} natureza="estimado" elegibilidade="prescrito" />);
    expect(screen.getByText(/prescrito/i)).toBeTruthy();
  });

  it('elegibilidade naoSeAplica não inventa rótulo de prazo', () => {
    render(<Dinheiro centavos={100} natureza="estimado" elegibilidade="naoSeAplica" />);
    expect(screen.queryByText(/prazo|prescrito/i)).toBeNull();
  });

  it('o número não quebra em duas linhas', () => {
    render(<Dinheiro centavos={100000000} natureza="estimado" elegibilidade="noPrazo" />);
    expect(screen.getByText('R$ 1.000.000,00').className).toContain('whitespace-nowrap');
  });
});
