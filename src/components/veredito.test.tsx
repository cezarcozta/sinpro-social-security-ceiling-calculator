// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Veredito } from './veredito';
import {
  PARSE_GATILHOS,
  RESULTADO_GATILHOS,
  RESULTADO_VAZIO,
} from '@/lib/apresentacao/__fixtures__/gatilhos';
import type { ResultadoTeto } from '@/lib/teto';

afterEach(cleanup);

const PARSE_LIMPO = { extrato: { filiado: {}, vinculos: [] }, warnings: [] };

function montar(teto: ResultadoTeto = RESULTADO_GATILHOS, parse = PARSE_GATILHOS, marcas = {}) {
  const onConferir = vi.fn();
  render(<Veredito teto={teto} parse={parse} marcas={marcas} onConferir={onConferir} />);
  return { onConferir };
}

describe('Veredito — a sangria', () => {
  it('nomeia o mês e mostra o valor como estimativa', () => {
    montar();
    expect(screen.getAllByText(/09\/2026/).length).toBeGreaterThan(0);
    expect(screen.getByText('R$ 118,42')).toBeTruthy();
    expect(screen.getAllByText(/estimado/i).length).toBeGreaterThan(0);
  });

  it('mostra a base acima do teto como valor exato, separada do dinheiro estimado', () => {
    montar();
    expect(screen.getByText('R$ 1.524,45')).toBeTruthy();
    expect(screen.getAllByText(/valor exato/i).length).toBeGreaterThan(0);
  });

  it('o botão da declaração está desabilitado, com o motivo visível', () => {
    montar();
    const botao = screen.getByRole('button', { name: /declara/i });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/ainda não está pronta/i)).toBeTruthy();
  });

  it('não promete que a declaração devolve o passado', () => {
    montar();
    expect(screen.getAllByText(/próximos meses|a partir do próximo/i).length).toBeGreaterThan(0);
  });

  it('extrato sem competência avaliada não diz que não houve excesso', () => {
    montar(RESULTADO_VAZIO, PARSE_LIMPO);
    expect(screen.getByText(/nenhum mês do seu extrato pôde ser avaliado/i)).toBeTruthy();
    expect(screen.queryByText(/você não passou do teto/i)).toBeNull();
  });
});

describe('Veredito — o acumulado', () => {
  it('mostra total a pedir e total prescrito como números separados', () => {
    montar();
    expect(screen.getByText('R$ 230,30')).toBeTruthy();
    expect(screen.getByText('R$ 20,00')).toBeTruthy();
    expect(screen.getByText(/fora do pedido/i)).toBeTruthy();
  });

  it('promove a contagem de meses urgentes', () => {
    montar();
    expect(screen.getByText(/90 dias/i)).toBeTruthy();
  });

  it('encaminha a restituição ao sindicato e nomeia o rito sem ensiná-lo', () => {
    montar();
    expect(screen.getAllByText(/Sinpro-ABC/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PER\/DCOMP/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /e-CAC/i })).toBeNull();
  });

  it('o achado do MEI aparece fora dos totais, com o rito próprio', () => {
    montar();
    expect(screen.getByText(/2\.055/)).toBeTruthy();
    expect(screen.getByText(/não está somado/i)).toBeTruthy();
    expect(screen.getByText('R$ 75,90')).toBeTruthy();
  });

  it('chama onConferir no botão de ver mês a mês', async () => {
    const { onConferir } = montar();
    screen.getByRole('button', { name: /mês a mês/i }).click();
    expect(onConferir).toHaveBeenCalledOnce();
  });
});

describe('Veredito — avisos e rodapé', () => {
  it('reúne avisos do parser, do motor e do INSS num bloco só', () => {
    montar();
    const bloco = screen.getByRole('alert');
    expect(bloco.textContent).toMatch(/não pôde ser lido/i);
    expect(bloco.textContent).toMatch(/salário de contribuição/i);
    expect(bloco.textContent).toMatch(/PREM-EXT/);
  });

  it('sem aviso nenhum, não existe bloco de alerta', () => {
    montar(RESULTADO_VAZIO, PARSE_LIMPO);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o rodapé permanente traz triagem e privacidade', () => {
    montar(RESULTADO_VAZIO, PARSE_LIMPO);
    expect(screen.getByText(/triagem/i)).toBeTruthy();
    expect(screen.getByText(/não sai do seu navegador/i)).toBeTruthy();
  });
});

describe('Veredito — caminho para a conferência', () => {
  it('oferece a conferência mesmo quando não há nada a pedir', () => {
    const semExcesso: ResultadoTeto = {
      ...RESULTADO_GATILHOS,
      competencias: RESULTADO_GATILHOS.competencias.map((c) => ({
        ...c,
        excedeuTeto: false,
        baseExcedenteCentavos: 0,
        retidoAMaiorCentavos: 0,
      })),
      achados: [],
      resumo: { ...RESULTADO_GATILHOS.resumo, mesesAcimaDoTeto: 0, totalAPedirCentavos: 0, totalPrescritoCentavos: 0 },
    };
    montar(semExcesso, PARSE_LIMPO);
    expect(screen.getByText(/não encontramos mês acima do teto/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /mês a mês/i })).toBeTruthy();
  });

  it('extrato sem competência nenhuma não oferece conferência vazia', () => {
    montar(RESULTADO_VAZIO, PARSE_LIMPO);
    expect(screen.queryByRole('button', { name: /mês a mês/i })).toBeNull();
  });
});
