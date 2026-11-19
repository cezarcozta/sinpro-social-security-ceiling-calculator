// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Veredito } from './veredito';
import { Conferencia } from './conferencia';
import { PARSE_GATILHOS, RESULTADO_GATILHOS } from '@/lib/apresentacao/__fixtures__/gatilhos';

/**
 * A §9 da spec da F2 ("Disclaimers obrigatórios na interface") cobrada em teste.
 *
 * Cada linha da tabela abaixo é uma linha daquela seção, e cada uma é acionada por um campo
 * da saída do motor — de propósito, para que a F3 implemente a regra em vez de depender de
 * alguém lembrar. A fixture `RESULTADO_GATILHOS` liga todos os gatilhos de uma vez.
 *
 * **Se este teste falhar, o ajuste é no componente, nunca aqui.** Uma frase que não cabe na
 * tela sem virar faixa de aviso vai colada ao número — é a regra da §7 do design: colado no
 * número, promovido ao veredito, lista no fim, ou rodapé permanente.
 */

function textoDoVeredito(): string {
  const { container } = render(
    <Veredito
      teto={RESULTADO_GATILHOS}
      parse={PARSE_GATILHOS}
      marcas={{}}
      onConferir={() => {}}
    />,
  );
  return container.textContent ?? '';
}

function textoDaConferencia(): string {
  const { container } = render(
    <Conferencia
      teto={RESULTADO_GATILHOS}
      extrato={PARSE_GATILHOS.extrato}
      marcas={{}}
      onMarcar={() => {}}
      onVoltar={() => {}}
    />,
  );
  return container.textContent ?? '';
}

type Onde = 'veredito' | 'conferencia' | 'ambas';

const GATILHOS: ReadonlyArray<readonly [string, string, RegExp, Onde]> = [
  ['camadas[].lido === false', 'o valor em dinheiro é estimativa', /estimado/i, 'ambas'],
  ['camadas[].lido === true', 'o valor foi lido do extrato', /lido do extrato/i, 'ambas'],
  ['baseExcedenteCentavos > 0', 'a base excedente é aritmética exata', /valor exato/i, 'ambas'],
  ['prescricao.noPrazo === false', 'passou do prazo e está fora do pedido', /fora do pedido/i, 'ambas'],
  ['prescricao.urgente === true', 'prescreve em até 90 dias', /90 dias/i, 'ambas'],
  ['achados[] MEI_DAS_INDEVIDO', 'o rito é a IN RFB 2.055/2021, no e-CAC', /2\.055/, 'veredito'],
  ['achados[] fora do total', 'não está somado ao total geral', /não está somado/i, 'veredito'],
  ['ignoradasSemTabela.length > 0', 'não foram avaliadas', /fora do período coberto/i, 'conferencia'],
  ['avisos.length > 0', 'houve linha que não entendemos', /não pôde ser lido|não entendemos/i, 'veredito'],
  ['decimoTerceiro === true', 'o 13º tem teto próprio', /teto próprio/i, 'conferencia'],
  ['sempre', 'estimativa de triagem, não cálculo oficial', /triagem/i, 'veredito'],
  ['sempre', 'confira com o sindicato', /Sinpro-ABC/, 'ambas'],
  ['sempre', 'nada do extrato sai do navegador', /não sai do seu navegador/i, 'veredito'],
] as const;

describe('§9 da spec da F2 — disclaimers obrigatórios', () => {
  afterEach(cleanup);

  it.each(GATILHOS)('%s → %s', (_gatilho, _promessa, frase, onde) => {
    if (onde === 'veredito' || onde === 'ambas') {
      expect(textoDoVeredito(), 'no veredito').toMatch(frase);
      cleanup();
    }
    if (onde === 'conferencia' || onde === 'ambas') {
      expect(textoDaConferencia(), 'na conferência').toMatch(frase);
    }
  });

  it('o rodapé permanente aparece em todo veredito, inclusive no limpo', () => {
    const texto = render(
      <Veredito
        teto={{ ...RESULTADO_GATILHOS, competencias: [], achados: [], avisos: [] }}
        parse={{ extrato: { filiado: {}, vinculos: [] }, warnings: [] }}
        marcas={{}}
        onConferir={() => {}}
      />,
    ).container.textContent;
    expect(texto).toMatch(/triagem/i);
    expect(texto).toMatch(/não sai do seu navegador/i);
  });
});
