import { describe, expect, it } from 'vitest';
import { agruparEmLinhas } from './rows';
import { classificar, extrairCamposFiliado } from './sections';
import type { TextItem } from './types';

const linhaDe = (pares: Array<[number, string]>, y = 100, page = 1) => {
  const items: TextItem[] = pares.map(([x, str]) => ({ page, x, y, str }));
  return agruparEmLinhas(items)[0];
};

describe('classificar', () => {
  it.each([
    ['INSS', [[407, 'INSS']]],
    ['cabeçalho CNIS', [[280, 'CNIS - Cadastro Nacional de Informações Sociais']]],
    ['título', [[357, 'Extrato Previdenciário']]],
    ['paginação', [[746, 'Página 3 de 5']]],
    ['seção de identificação', [[43, 'Identificação do Filiado']]],
    ['seção de relações', [[43, 'Relações Previdenciárias']]],
    ['rodapé legal', [[25, 'O INSS poderá rever a qualquer tempo as informações constantes deste extrato, observados os arts.19 ao 19-F do RPS aprovado pelo Decreto 3.048/99.']]],
    ['rodapé legal 2', [[25, 'O segurado somente terá reconhecida como tempo de contribuição ao RGPS a competência cujo valor consolidado seja igual ou superior ao salário mínimo']]],
    ['rodapé legal 3', [[25, 'ou agrupamento, conforme o caso, de acordo com o § 14 do art.195 da CF/1988 e art.29 da EC 103/2019.']]],
  ])('ignora %s', (_nome, pares) => {
    expect(classificar(linhaDe(pares as Array<[number, string]>))).toBe('ignorar');
  });

  it('reconhece a data de geração do extrato', () => {
    expect(classificar(linhaDe([[749, '18/11/2026 08:29:58']]))).toBe('gerado-em');
  });

  it.each([
    [[[25, 'NIT:'], [55, '987.65432.10-9'], [228, 'CPF:'], [263, '111.222.333-44'], [361, 'Nome:'], [405, 'JOAO PROFESSOR DA SILVA']]],
    [[[25, 'Data de nascimento:'], [150, '01/01/1980'], [361, 'Nome da mãe:'], [455, 'MARIA PROFESSORA DA SILVA']]],
  ])('reconhece a linha de dados do filiado', (pares) => {
    expect(classificar(linhaDe(pares as Array<[number, string]>))).toBe('filiado');
  });

  it('reconhece o cabeçalho de vínculo pela primeira célula Seq.', () => {
    const linha = linhaDe([[35, 'Seq.'], [87, 'NIT'], [152, 'Código Emp.'], [301, 'Origem do Vínculo']]);
    expect(classificar(linha)).toBe('cabecalho-vinculo');
  });

  it.each(['Remunerações', 'Contribuições'])('reconhece o rótulo de seção %s', (rotulo) => {
    expect(classificar(linhaDe([[54, rotulo]]))).toBe('rotulo-secao');
  });

  it.each(['Valores Consolidados por Ano Civil', 'Legenda de Indicadores'])('trata %s como fim dos vínculos', (rotulo) => {
    expect(classificar(linhaDe([[59, rotulo]]))).toBe('fim');
  });

  it('trata qualquer outra linha como dados', () => {
    expect(classificar(linhaDe([[55, '03/2017'], [148, '366,67']]))).toBe('dados');
    expect(classificar(linhaDe([[474, 'Matrícula do'], [566, 'Tipo Filiado no']]))).toBe('dados');
  });
});

describe('extrairCamposFiliado', () => {
  it('lê NIT, CPF e nome da primeira linha', () => {
    const campos = extrairCamposFiliado(
      linhaDe([[25, 'NIT:'], [55, '987.65432.10-9'], [228, 'CPF:'], [263, '111.222.333-44'], [361, 'Nome:'], [405, 'JOAO PROFESSOR DA SILVA']]),
    );
    expect(campos).toEqual({ nit: '987.65432.10-9', cpf: '111.222.333-44', nome: 'JOAO PROFESSOR DA SILVA' });
  });

  it('lê data de nascimento e nome da mãe da segunda linha', () => {
    const campos = extrairCamposFiliado(
      linhaDe([[25, 'Data de nascimento:'], [150, '01/01/1980'], [361, 'Nome da mãe:'], [455, 'MARIA PROFESSORA DA SILVA']]),
    );
    expect(campos).toEqual({ dataNascimento: '01/01/1980', nomeMae: 'MARIA PROFESSORA DA SILVA' });
  });

  it('ignora rótulo sem valor à direita', () => {
    expect(extrairCamposFiliado(linhaDe([[25, 'NIT:']]))).toEqual({});
  });
});

describe('chaves herdadas do protótipo', () => {
  it('não tratam "constructor" como rótulo do filiado', () => {
    const linha = linhaDe([[43, 'constructor'], [120, 'qualquer coisa']]);
    expect(classificar(linha)).toBe('dados');
    expect(extrairCamposFiliado(linha)).toEqual({});
  });

  it('classificar não lança diante de linha vazia', () => {
    expect(classificar({ page: 1, y: 100, items: [] })).toBe('dados');
  });
});
