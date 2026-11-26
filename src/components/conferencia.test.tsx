// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Conferencia } from './conferencia';
import { PARSE_GATILHOS, RESULTADO_GATILHOS } from '@/lib/apresentacao/__fixtures__/gatilhos';
import type { Marcas } from '@/lib/apresentacao/veredito';

afterEach(cleanup);

/** Só os cartões de ano: a competência também é um `group` (fieldset com legend). */
const anosNaTela = () =>
  screen.getAllByRole('group').filter((g): g is HTMLDetailsElement => g.tagName === 'DETAILS');

function montar(marcas: Marcas = {}) {
  const onMarcar = vi.fn();
  const onVoltar = vi.fn();
  render(
    <Conferencia
      teto={RESULTADO_GATILHOS}
      extrato={PARSE_GATILHOS.extrato}
      marcas={marcas}
      onMarcar={onMarcar}
      onVoltar={onVoltar}
    />,
  );
  return { onMarcar, onVoltar };
}

describe('Conferencia', () => {
  it('um cartão por ano, do mais recente para o mais antigo', () => {
    montar();
    const anos = anosNaTela().map((g) => g.textContent?.slice(0, 4));
    expect(anos).toEqual(['2026', '2025', '2024', '2021']);
  });

  it('abre o ano da última competência e deixa os outros fechados', () => {
    montar();
    const abertos = anosNaTela()
      .filter((g) => g.open)
      .map((g) => g.textContent?.slice(0, 4));
    expect(abertos).toEqual(['2026']);
  });

  it('mostra as fontes pagadoras do mês, com o rótulo do empregador', () => {
    montar();
    const agosto = screen.getByRole('group', { name: 'Ano 2024' });
    // o vínculo 1 paga em 08, 12 e 13/2024: aparece três vezes no cartão do ano
    expect(within(agosto).getAllByText('11.111.111/0001-11')).toHaveLength(3);
    expect(within(agosto).getByText('22.222.222/0001-22')).toBeTruthy();
    expect(within(agosto).getByText('R$ 5.000,00')).toBeTruthy();
    expect(within(agosto).getByText('R$ 4.500,00')).toBeTruthy();
  });

  it('distingue fonte lida de fonte estimada por texto', () => {
    montar();
    const setembro = screen.getByRole('group', { name: 'Ano 2026' });
    expect(within(setembro).getAllByText(/lido do extrato/i).length).toBeGreaterThan(0);
    expect(within(setembro).getAllByText(/estimado/i).length).toBeGreaterThan(0);
  });

  it('cada competência tem o par de radio, inclusive prescrita e 13º', () => {
    montar();
    for (const competencia of ['02/2021', '13/2024', '09/2026']) {
      const grupo = screen.getByRole('group', { name: new RegExp(competencia.replace('/', '\\/')) });
      expect(within(grupo).getAllByRole('radio')).toHaveLength(2);
    }
  });

  it('marcar "não bate" chama onMarcar com a competência', () => {
    const { onMarcar } = montar();
    const grupo = screen.getByRole('group', { name: /08\/2024/ });
    fireEvent.click(within(grupo).getByRole('radio', { name: /não bate/i }));
    expect(onMarcar).toHaveBeenCalledWith('08/2024', 'naoBate');
  });

  it('mês marcado "não bate" mostra o texto para copiar, sem CPF nem CNPJ', () => {
    montar({ '08/2024': 'naoBate' });
    const texto = screen.getByLabelText(/texto do mês que não bateu/i) as HTMLTextAreaElement;
    expect(texto.value).toContain('08/2024');
    expect(texto.value).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    expect(texto.value).toMatch(/não contém/i);
  });

  it('a linha do 13º diz que o teto é próprio', () => {
    montar();
    const grupo = screen.getByRole('group', { name: /13\/2024/ });
    expect(within(grupo).getByText(/teto próprio/i)).toBeTruthy();
  });

  it('a linha prescrita traz a data de prescrição e "fora do pedido"', () => {
    montar();
    const grupo = screen.getByRole('group', { name: /02\/2021/ });
    expect(within(grupo).getByText(/20\/03\/2026/)).toBeTruthy();
    expect(within(grupo).getByText(/fora do pedido/i)).toBeTruthy();
  });

  it('a linha urgente avisa do prazo em texto, não só em cor', () => {
    montar();
    const grupo = screen.getByRole('group', { name: /12\/2021/ });
    expect(within(grupo).getByText(/90 dias|62 dias/i)).toBeTruthy();
  });

  it('a base acima do teto aparece como valor exato', () => {
    montar();
    const grupo = screen.getByRole('group', { name: /09\/2026/ });
    expect(within(grupo).getByText('R$ 1.524,45')).toBeTruthy();
    expect(within(grupo).getAllByText(/valor exato/i).length).toBeGreaterThan(0);
  });

  it('lista as competências não avaliadas por falta de tabela', () => {
    montar();
    expect(screen.getByText(/fora do período coberto/i)).toBeTruthy();
    expect(screen.getByText(/07\/2019/)).toBeTruthy();
  });

  it('o valor em dinheiro não quebra em duas linhas', () => {
    montar();
    expect(screen.getAllByText('R$ 5.000,00')[0].className).toContain('whitespace-nowrap');
  });

  it('chama onVoltar no botão de voltar ao resumo', () => {
    const { onVoltar } = montar();
    screen.getByRole('button', { name: /voltar/i }).click();
    expect(onVoltar).toHaveBeenCalledOnce();
  });
});

describe('Conferencia — abrir tudo para conferir e imprimir', () => {
  it('abre todos os anos de uma vez, e volta a fechar', () => {
    montar();
    const fechadosAntes = anosNaTela().filter((g) => !g.open).length;
    expect(fechadosAntes).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /abrir todos/i }));
    expect(anosNaTela().every((g) => g.open)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /fechar/i }));
    expect(anosNaTela().filter((g) => !g.open).length).toBe(fechadosAntes);
  });
});
