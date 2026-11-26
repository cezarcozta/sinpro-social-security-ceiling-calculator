// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fixture from '@/lib/cnis/__fixtures__/extrato-exemplo.textlayer.json';
import { montarExtrato } from '@/lib/cnis/parse-cnis';
import type { TextItem } from '@/lib/cnis/types';
import { calcularTeto } from '@/lib/teto';
import { TelasDoResultado } from './resultado-teto';

/**
 * O caminho inteiro com o extrato **real** (anonimizado): camada de texto → parser → motor
 * → as duas telas. Substitui a conferência manual no navegador por algo que roda sempre.
 *
 * Nenhuma asserção sobre valores do extrato real: o que este teste prova é que a tela
 * aguenta dado de verdade — todas as naturezas de vínculo, competências fora do período
 * coberto, avisos reais — sem quebrar nem mostrar `NaN`.
 *
 * O extrato de exemplo tem as datas deslocadas pela anonimização e termina antes de 2021,
 * então ele exercita justamente o caminho mais fácil de esquecer: **nada avaliado**, tudo em
 * `ignoradasSemTabela`. Os caminhos com dinheiro são cobertos pela fixture de gatilhos.
 */
describe('ponta a ponta com o extrato de exemplo', () => {
  afterEach(cleanup);

  const parse = montarExtrato(fixture as TextItem[]);
  const teto = calcularTeto(parse.extrato, '2026-11-19');

  it('o veredito renderiza, sem NaN e sem valor sem rótulo', () => {
    render(<TelasDoResultado parse={parse} teto={teto} onOutroExtrato={() => {}} />);
    expect(document.body.textContent).not.toContain('NaN');
    expect(document.body.textContent).not.toContain('undefined');
    // o rodapé permanente está lá qualquer que seja o veredito
    expect(screen.getByText(/triagem/i)).toBeTruthy();
    expect(screen.getAllByText(/não sai do seu navegador/i).length).toBeGreaterThan(0);
  });

  it('a conferência renderiza todos os anos do extrato real', () => {
    render(<TelasDoResultado parse={parse} teto={teto} onOutroExtrato={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /conferir|não avaliados/i }));

    const anos = screen
      .queryAllByRole('group')
      .filter((g) => g.tagName === 'DETAILS')
      .map((g) => Number(g.getAttribute('aria-label')!.replace('Ano ', '')));

    // o extrato de exemplo é todo anterior a 2021: nada avaliado, tudo em ignoradasSemTabela
    expect([...anos].sort((a, b) => b - a)).toEqual(anos);
    expect(document.body.textContent).not.toContain('NaN');
    if (anos.length === 0) {
      expect(screen.getByText(/fora do período coberto/i)).toBeTruthy();
    }
  });

  it('todo valor em dinheiro da tela tem rótulo de natureza colado', () => {
    render(<TelasDoResultado parse={parse} teto={teto} onOutroExtrato={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /conferir|não avaliados/i }));

    const valores = [...document.querySelectorAll('span.whitespace-nowrap')];
    for (const valor of valores) {
      const rotulo = valor.parentElement!.textContent ?? '';
      expect(rotulo, valor.textContent ?? '').toMatch(/estimado|lido do extrato|valor exato/);
    }
  });
});
