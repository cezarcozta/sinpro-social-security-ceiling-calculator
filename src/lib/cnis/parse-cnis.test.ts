import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/extrato-exemplo.textlayer.json';
import { montarExtrato } from './parse-cnis';
import { CnisParseError, TIPO_FILIADO_CLT, type CnisExtrato, type TextItem, type VinculoRemunerado } from './types';

/** Busca por seq, não por índice: a ordem e o tamanho de `vinculos` mudaram na F1.5. */
function remunerado(extrato: CnisExtrato, seq: number): VinculoRemunerado {
  const v = extrato.vinculos.find((x) => x.seq === seq);
  if (!v) throw new Error(`vínculo ${seq} não encontrado`);
  if (v.natureza === 'CI_PROPRIO') throw new Error(`vínculo ${seq} não tem remunerações`);
  return v;
}

const itens = fixture as TextItem[];
const { extrato, warnings } = montarExtrato(itens);
const cents = (valor: string) => Number(valor.replaceAll('.', '').replace(',', ''));

describe('montarExtrato sobre o extrato de exemplo', () => {
  it('lê o cabeçalho do filiado', () => {
    expect(extrato.filiado).toEqual({
      nome: 'JOAO PROFESSOR DA SILVA',
      nit: '987.65432.10-9',
      cpf: '111.222.333-44',
      dataNascimento: '01/01/1970',
      nomeMae: 'MARIA PROFESSORA DA SILVA',
    });
    expect(extrato.geradoEm).toBe('18/11/2016 00:00:00');
  });

  it('lê a Legenda de Indicadores da última página, com a descrição do próprio INSS', () => {
    // Fixação contra o extrato real: é a fonte primária do significado de cada indicador,
    // e ela chega dentro do documento. Se o INSS mudar a seção, este teste cai antes de a
    // tela passar a mostrar descrição errada.
    expect(extrato.legenda).toEqual([
      { codigo: 'IREC-INDPEND', descricao: 'Recolhimentos com indicadores/pendências' },
      {
        codigo: 'IREC-LC123',
        descricao: 'Recolhimento no Plano Simplificado de Previdência Social (LC 123/2006)',
      },
      {
        codigo: 'IREC-MEI',
        descricao: 'Indica que a contribuição da competência foi recolhida com código MEI',
      },
      { codigo: 'IREM-INDPEND', descricao: 'Remunerações com indicadores/pendências' },
      {
        codigo: 'PSC-MEN-SM-EC103',
        descricao:
          'Pendência na competência em que o somatório dos salários de contribuição é menor que o mínimo. Competência pode ser passível de complementação, utilização ou agrupamento, de acordo com a EC 103/2019.',
      },
    ]);
  });

  it('a legenda cobre todo indicador que aparece nos vínculos do extrato', () => {
    const usados = new Set<string>();
    for (const v of extrato.vinculos) {
      for (const c of v.indicadores ?? []) usados.add(c);
      const linhas = v.natureza === 'CI_PROPRIO' ? v.contribuicoes : v.remuneracoes;
      for (const l of linhas) for (const c of l.indicadores) usados.add(c);
    }
    const descritos = new Set(extrato.legenda.map((l) => l.codigo));
    expect([...usados].filter((c) => !descritos.has(c))).toEqual([]);
  });

  it('devolve os 5 vínculos com a natureza de cada um', () => {
    const { extrato } = montarExtrato(itens);
    expect(extrato.vinculos.map((v) => [v.seq, v.natureza])).toEqual([
      [1, 'CLT'],
      [2, 'CI_PROPRIO'],
      [3, 'CI_PROPRIO'],
      [4, 'CLT'],
      [5, 'CI_PRESTADOR'],
    ]);
  });

  it('o tipo de filiado confere com a natureza detectada, sem divergência', () => {
    const { extrato, warnings } = montarExtrato(itens);
    const porSeq = new Map(extrato.vinculos.map((v) => [v.seq, v]));
    expect(porSeq.get(1)!.tipoFiliado).toBe('Empregado ou Agente Público');
    expect(porSeq.get(2)!.tipoFiliado).toBe('Contribuinte Individual');
    expect(porSeq.get(5)!.tipoFiliado).toBe('Contribuinte Individual');
    expect(warnings.filter((w) => w.codigo === 'NATUREZA_DIVERGENTE')).toEqual([]);
    expect(warnings.filter((w) => w.codigo === 'NATUREZA_INDEFINIDA')).toEqual([]);
  });

  it('lê os campos do vínculo 1', () => {
    const v1 = remunerado(extrato, 1);
    expect(v1.tipoFiliado).toBe(TIPO_FILIADO_CLT);
    expect(v1.codigoEmp).toBe('12.345.678/0001-95');
    expect(v1.origem).toBe('COLEGIO ALFA LTDA');
    expect(v1.dataInicio).toBe('20/03/2007');
    expect(v1.dataFim).toBe('15/06/2008');
    expect(v1.ultRemun).toBe('06/2008');
  });

  it('preserva Código Emp. que não é CNPJ (CEI/CNO) no vínculo 4', () => {
    expect(remunerado(extrato, 4).codigoEmp).toBe('98.765.432');
    expect(remunerado(extrato, 4).origem).toBe('ESCOLA BETA S/A');
    expect(remunerado(extrato, 4).matricula).toBe('900111');
  });

  it('lê as 16 competências do vínculo 1, em ordem', () => {
    const v1 = remunerado(extrato, 1);
    expect(v1.remuneracoes).toHaveLength(16);
    expect(v1.remuneracoes[0].competencia).toBe('03/2007');
    expect(v1.remuneracoes.at(-1)!.competencia).toBe('06/2008');
  });

  it.each([
    [0, '03/2007', '366,67'],
    [1, '04/2007', '1.025,18'],
    [9, '12/2007', '1.478,15'],
    [15, '06/2008', '658,58'],
  ])('vínculo 1, remuneração %i = %s / %s', (indice, competencia, valor) => {
    const r = remunerado(extrato, 1).remuneracoes[indice];
    expect(r.competencia).toBe(competencia);
    expect(r.valorCentavos).toBe(cents(valor));
  });

  it('lê as 30 competências do vínculo 4, atravessando a quebra de página', () => {
    const v4 = remunerado(extrato, 4);
    expect(v4.remuneracoes).toHaveLength(30);
    expect(v4.remuneracoes[0].competencia).toBe('01/2013');
    expect(v4.remuneracoes.at(-1)!.competencia).toBe('06/2015');
    // 10/2013 em diante está na página 3, sem cabeçalho repetido
    expect(v4.remuneracoes.find((r) => r.competencia === '06/2013')!.valorCentavos).toBe(cents('10.428,53'));
    expect(v4.remuneracoes.find((r) => r.competencia === '11/2013')!.valorCentavos).toBe(cents('9.521,45'));
    expect(v4.remuneracoes.find((r) => r.competencia === '03/2014')!.valorCentavos).toBe(cents('11.082,26'));
  });

  it('captura indicadores de nível de vínculo apenas onde existem', () => {
    expect(remunerado(extrato, 4).indicadores).toEqual(['IREM-INDPEND']);
    expect(remunerado(extrato, 1)).not.toHaveProperty('indicadores');
  });

  it('não produz nenhum aviso para este extrato', () => {
    expect(warnings).toEqual([]);
  });

  it('não inclui competências da seção Valores Consolidados por Ano Civil', () => {
    const todas = extrato.vinculos.flatMap((v) =>
      v.natureza === 'CI_PROPRIO' ? [] : v.remuneracoes.map((r) => r.competencia),
    );
    expect(todas).not.toContain('2014');
    expect(todas.every((c) => /^(0[1-9]|1[0-3])\/\d{4}$/.test(c))).toBe(true);
  });

  it('lê as 17 competências do vínculo 5 (prestador de serviço)', () => {
    const { extrato } = montarExtrato(itens);
    const v5 = extrato.vinculos.find((v) => v.seq === 5)!;
    expect(v5.natureza).toBe('CI_PRESTADOR');
    if (v5.natureza === 'CI_PROPRIO') throw new Error('natureza inesperada');
    expect(v5.remuneracoes).toHaveLength(17);
    expect(v5.remuneracoes[0]).toEqual({
      competencia: '06/2015',
      valorCentavos: 10000,
      indicadores: [],
    });
    expect(v5.remuneracoes.at(-1)).toEqual({
      competencia: '10/2016',
      valorCentavos: 372343,
      indicadores: [],
    });
    expect(v5.remuneracoes.find((r) => r.competencia === '07/2015')!.valorCentavos).toBe(486534);
    // 08/2015 a 05/2016 — dez meses; as outras ocorrências de 3.920,00 na fixture são
    // da seção Valores Consolidados por Ano Civil, que não entra no vínculo.
    expect(v5.remuneracoes.filter((r) => r.valorCentavos === 392000)).toHaveLength(10);
  });

  it('lê as contribuições do vínculo 2 com as duas cifras', () => {
    const { extrato } = montarExtrato(itens);
    const v2 = extrato.vinculos.find((v) => v.seq === 2)!;
    expect(v2.natureza).toBe('CI_PROPRIO');
    if (v2.natureza !== 'CI_PROPRIO') throw new Error('natureza inesperada');
    expect(v2.contribuicoes).toHaveLength(5);
    expect(v2.contribuicoes[0]).toEqual({
      competencia: '10/2010',
      dataPgto: '22/09/2011',
      contribuicaoCentavos: 5225,
      salarioContribuicaoCentavos: 104500,
      indicadores: ['IREC-LC123', 'IREC-MEI'],
    });
    expect(v2.contribuicoes.map((c) => c.competencia)).toEqual([
      '10/2010', '11/2010', '12/2010', '01/2011', '02/2011',
    ]);
  });

  it('lê as 14 contribuições do vínculo 3', () => {
    const { extrato } = montarExtrato(itens);
    const v3 = extrato.vinculos.find((v) => v.seq === 3)!;
    if (v3.natureza !== 'CI_PROPRIO') throw new Error('natureza inesperada');
    expect(v3.contribuicoes).toHaveLength(14);
    expect(v3.contribuicoes.at(-1)).toEqual({
      competencia: '11/2012',
      dataPgto: '12/12/2012',
      contribuicaoCentavos: 6060,
      salarioContribuicaoCentavos: 121200,
      indicadores: ['IREC-LC123', 'IREC-MEI'],
    });
  });

  it('a competência 01/2011 tem base proporcional e a célula de indicadores quebrada em duas linhas', () => {
    const { extrato, warnings } = montarExtrato(itens);
    const v2 = extrato.vinculos.find((v) => v.seq === 2)!;
    if (v2.natureza !== 'CI_PROPRIO') throw new Error('natureza inesperada');
    const c = v2.contribuicoes.find((x) => x.competencia === '01/2011')!;
    // No PDF a célula de indicadores desta linha ocupa duas linhas visuais, centradas na
    // linha de dados: "PSC-MEN-SM-EC103," acima e "IREC-LC123, IREC-MEI" abaixo.
    expect(c).toEqual({
      competencia: '01/2011',
      dataPgto: '16/06/2015',
      contribuicaoCentavos: 3020,
      salarioContribuicaoCentavos: 60400,
      indicadores: ['PSC-MEN-SM-EC103', 'IREC-LC123', 'IREC-MEI'],
    });
    expect(warnings).toEqual([]);
  });

  it('a continuação de indicadores não vaza para a competência do grupo vizinho', () => {
    const { extrato } = montarExtrato(itens);
    const v2 = extrato.vinculos.find((v) => v.seq === 2)!;
    if (v2.natureza !== 'CI_PROPRIO') throw new Error('natureza inesperada');
    // 02/2011 está no grupo de colunas ao lado, na mesma linha de dados que 01/2011.
    expect(v2.contribuicoes.find((x) => x.competencia === '02/2011')!.indicadores).toEqual([
      'IREC-LC123',
      'IREC-MEI',
    ]);
  });

  it('toda contribuição lida é inteira em centavos', () => {
    const { extrato } = montarExtrato(itens);
    for (const v of extrato.vinculos) {
      if (v.natureza !== 'CI_PROPRIO') continue;
      for (const c of v.contribuicoes) {
        expect(Number.isInteger(c.contribuicaoCentavos)).toBe(true);
        expect(Number.isInteger(c.salarioContribuicaoCentavos)).toBe(true);
      }
    }
  });

  it('nenhum vínculo perde competências em silêncio', () => {
    const { extrato, warnings } = montarExtrato(itens);
    const quantidades = extrato.vinculos.map((v) => [
      v.seq,
      v.natureza === 'CI_PROPRIO' ? v.contribuicoes.length : v.remuneracoes.length,
    ]);
    expect(quantidades).toEqual([
      [1, 16],
      [2, 5],
      [3, 14],
      [4, 30],
      [5, 17],
    ]);
    expect(warnings).toEqual([]);
  });

  it('a contagem de competências bate com o intervalo de datas do vínculo', () => {
    const { extrato } = montarExtrato(itens);
    const mesesEntre = (inicio: string, fim: string): number => {
      const [, mi, ai] = inicio.split('/').map(Number);
      const [, mf, af] = fim.split('/').map(Number);
      return (af - ai) * 12 + (mf - mi) + 1;
    };
    for (const v of extrato.vinculos) {
      if (!v.dataInicio || !v.dataFim) continue;
      const lidas = v.natureza === 'CI_PROPRIO' ? v.contribuicoes.length : v.remuneracoes.length;
      // Lacunas são legítimas (mês sem recolhimento), então o teto é o limite superior.
      // Passar dele significa competência duplicada ou vazada de outro vínculo.
      expect(lidas).toBeLessThanOrEqual(mesesEntre(v.dataInicio, v.dataFim));
    }
  });

  it('06/2015 tem vínculo CLT e prestador ao mesmo tempo', () => {
    const { extrato } = montarExtrato(itens);
    const naCompetencia = extrato.vinculos.filter(
      (v) => v.natureza !== 'CI_PROPRIO' && v.remuneracoes.some((r) => r.competencia === '06/2015'),
    );
    expect(naCompetencia.map((v) => [v.seq, v.natureza])).toEqual([
      [4, 'CLT'],
      [5, 'CI_PRESTADOR'],
    ]);
  });
});

/**
 * Extratos sintéticos: as classes de entrada abaixo não existem no extrato de exemplo,
 * e cada uma delas já custou uma competência perdida em silêncio.
 */
const MARCA = 'CNIS - Cadastro Nacional de Informações Sociais';
type Celula = [x: number, str: string];

function extratoSintetico(linhas: Array<[y: number, celulas: Celula[]]>, page = 1): TextItem[] {
  const itens: TextItem[] = [{ page, x: 280, y: 59, str: MARCA }];
  for (const [y, celulas] of linhas) {
    for (const [x, str] of celulas) itens.push({ page, x, y, str });
  }
  return itens;
}

const CABECALHO_VINCULO: [number, Celula[]] = [
  200,
  [[35, 'Seq.'], [87, 'NIT'], [152, 'Código Emp.'], [301, 'Origem do Vínculo'], [475, 'Trabalhador'],
   [582, 'Tipo Filiado no Vínculo'], [650, 'Data Início'], [705, 'Data Fim'], [755, 'Últ. Remun.']],
];
const LINHA_VINCULO_CI: [number, Celula[]] = [
  214,
  [[42, '1'], [67, '123.45678.90-1'], [139, '11.222.333/0001-81'], [287, 'ESCOLA BETA'],
   [554, 'Contribuinte Individual'], [651, '01/2020'], [702, '12/2020'], [765, '12/2020']],
];
const cabecalhoPrestador = (y: number): [number, Celula[]] => [
  y,
  [[43, 'Competência'], [120, 'Contrat.'], [200, 'Estabelecimento'], [300, 'Tomador'],
   [400, 'Forma Prestação Serviço'], [560, 'Remuneração'], [680, 'Indicadores']],
];
const cabecalhoProprio = (y: number): [number, Celula[]] => [
  y,
  [[43, 'Competência'], [120, 'Data Pgto.'], [200, 'Contribuição'], [300, 'Salário Contribuição'], [420, 'Indicadores']],
];

describe('montarExtrato — vínculo com duas tabelas', () => {
  it('não descarta a primeira tabela em silêncio quando a segunda tem outro layout', () => {
    const { extrato: e, warnings: w } = montarExtrato(
      extratoSintetico([
        CABECALHO_VINCULO,
        LINHA_VINCULO_CI,
        [251, [[54, 'Remunerações']]],
        cabecalhoPrestador(267),
        [290, [[43, '01/2020'], [560, '5.000,00']]],
        [310, [[54, 'Contribuições']]],
        cabecalhoProprio(330),
        [350, [[43, '02/2020'], [120, '15/03/2020'], [200, '55,00'], [300, '1.100,00']]],
      ]),
    );
    // A natureza do vínculo é uma só, mas a lista que ela deixa de fora não pode evaporar.
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'TABELA_DESCARTADA', seq: 1, detalhe: expect.stringContaining('01/2020') }),
    ]);
    expect(e.vinculos).toHaveLength(1);
  });

  it('reinicia a costura de indicadores a cada tabela nova do mesmo vínculo', () => {
    const { extrato: e } = montarExtrato(
      extratoSintetico([
        CABECALHO_VINCULO,
        LINHA_VINCULO_CI,
        [251, [[54, 'Contribuições']]],
        cabecalhoProprio(267),
        [290, [[43, '01/2020'], [120, '15/02/2020'], [200, '55,00'], [300, '1.100,00'], [420, 'IREC-MEI']]],
        [310, [[54, 'Contribuições']]],
        cabecalhoProprio(330),
        // Linha só com indicador, antes de qualquer competência desta tabela: não há a quem
        // costurar, e costurar na competência da tabela anterior seria inventar dado.
        [350, [[420, 'IREC-LC123']]],
      ]),
    );
    const v1 = e.vinculos[0];
    if (v1.natureza !== 'CI_PROPRIO') throw new Error('natureza inesperada');
    expect(v1.contribuicoes[0].indicadores).toEqual(['IREC-MEI']);
  });
});

const CABECALHO_CLT_TABELA = (y: number): [number, Celula[]] => [
  y,
  [[43, 'Competência'], [131, 'Remuneração'], [221, 'Indicadores']],
];
const LINHA_VINCULO_CLT: [number, Celula[]] = [
  214,
  [[42, '1'], [67, '123.45678.90-1'], [139, '12.345.678/0001-95'], [287, 'COLEGIO ALFA'],
   [554, 'Empregado ou Agente Público'], [651, '01/2020'], [702, '05/2020'], [765, '05/2020']],
];

describe('montarExtrato — rótulo de seção ilegível', () => {
  it('abre a tabela pelo cabeçalho de colunas quando o rótulo da seção não é reconhecido', () => {
    // "Remunerações" partido em dois itens vira o texto "Remuneraç ões", que não casa com
    // o rótulo de seção. Sem isto a tabela inteira era engolida pela continuação do vínculo
    // e o usuário recebia "vínculo sem tabela de competências" — aviso enganoso.
    const { extrato: e, warnings: w } = montarExtrato(
      extratoSintetico([
        CABECALHO_VINCULO,
        LINHA_VINCULO_CLT,
        [251, [[54, 'Remuneraç'], [110, 'ões']]],
        CABECALHO_CLT_TABELA(267),
        [290, [[43, '01/2020'], [131, '5.000,00']]],
        [305, [[43, '02/2020'], [131, '5.100,00']]],
      ]),
    );
    expect(remunerado(e, 1).remuneracoes.map((r) => r.competencia)).toEqual(['01/2020', '02/2020']);
    expect(w).toEqual([]);
  });
});

describe('montarExtrato — tabela que continua sem repetir o cabeçalho de colunas', () => {
  it('reaproveita as colunas da tabela anterior em vez de abandonar as competências', () => {
    // Página de continuação que repete o rótulo da seção mas não o cabeçalho de colunas.
    const pagina1 = extratoSintetico([
      CABECALHO_VINCULO,
      LINHA_VINCULO_CLT,
      [251, [[54, 'Remunerações']]],
      CABECALHO_CLT_TABELA(267),
      [290, [[43, '01/2020'], [131, '5.000,00']]],
      [305, [[43, '02/2020'], [131, '5.100,00']]],
    ]);
    const pagina2 = extratoSintetico(
      [
        [100, [[54, 'Remunerações']]],
        [120, [[43, '03/2020'], [131, '9.000,00']]],
        [135, [[43, '04/2020'], [131, '9.100,00']]],
      ],
      2,
    ).filter((i) => i.str !== MARCA);
    const { extrato: e, warnings: w } = montarExtrato([...pagina1, ...pagina2]);
    expect(remunerado(e, 1).remuneracoes.map((r) => r.competencia)).toEqual([
      '01/2020', '02/2020', '03/2020', '04/2020',
    ]);
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'CABECALHO_REAPROVEITADO', pagina: 2, seq: 1 }),
    ]);
  });
});

describe('montarExtrato — bloco pulado', () => {
  it('diz quantas competências ficaram de fora quando o vínculo não pôde ser lido', () => {
    // Linha de vínculo sem seq: o vínculo é pulado, e com ele a tabela inteira. O aviso de
    // layout não dizia o tamanho do prejuízo; agora um segundo aviso lista as competências.
    const { extrato: e, warnings: w } = montarExtrato(
      extratoSintetico([
        CABECALHO_VINCULO,
        [214, [[139, '12.345.678/0001-95'], [554, 'Empregado ou Agente Público']]],
        [251, [[54, 'Remunerações']]],
        CABECALHO_CLT_TABELA(267),
        [290, [[43, '01/2020'], [131, '5.000,00']]],
        [305, [[43, '02/2020'], [131, '5.100,00']]],
      ]),
    );
    expect(e.vinculos).toEqual([]);
    expect(w.map((aviso) => aviso.codigo)).toEqual(['LAYOUT_DESCONHECIDO', 'BLOCO_PULADO']);
    expect(w[1].detalhe).toContain('01/2020');
    expect(w[1].detalhe).toContain('02/2020');
  });
});

describe('montarExtrato — cabeçalho de vínculo repetido no meio da tabela', () => {
  it('o aviso carrega o seq lido e diz que a linha veio no meio de uma tabela', () => {
    const { extrato: e, warnings: w } = montarExtrato(
      extratoSintetico([
        CABECALHO_VINCULO,
        LINHA_VINCULO_CLT,
        [251, [[54, 'Remunerações']]],
        CABECALHO_CLT_TABELA(267),
        [290, [[43, '01/2020'], [131, '5.000,00']]],
        // Cabeçalho de vínculo repetido: a linha de dados seguinte é lida como linha de
        // vínculo, com "02/2020" caindo na coluna Seq.
        [305, [[35, 'Seq.'], [87, 'NIT'], [152, 'Código Emp.'], [301, 'Origem do Vínculo'],
               [475, 'Trabalhador'], [582, 'Tipo Filiado no Vínculo'], [650, 'Data Início'],
               [705, 'Data Fim'], [755, 'Últ. Remun.']]],
        [320, [[43, '02/2020'], [131, '5.100,00']]],
        [335, [[43, '03/2020'], [131, '5.200,00']]],
      ]),
    );
    expect(remunerado(e, 1).remuneracoes.map((r) => r.competencia)).toEqual(['01/2020']);
    expect(w[0]).toEqual(
      expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', seq: 2, detalhe: expect.stringContaining('02/2020') }),
    );
    expect(w[1]).toEqual(expect.objectContaining({ codigo: 'BLOCO_PULADO', detalhe: expect.stringContaining('03/2020') }));
  });
});

describe('montarExtrato — indicador partido no hífen', () => {
  it('junta as duas metades do código em vez de criar dois indicadores', () => {
    // Vínculo 4, 01/2013: o PDF corta "PSC-MEN-SM-EC103" no hífen, numa linha visual acima
    // ("PSC-MEN-SM-") e outra abaixo ("EC103"). A F2 compara indicador por string exata.
    const { extrato: e, warnings: w } = montarExtrato(itens);
    expect(remunerado(e, 4).remuneracoes.find((r) => r.competencia === '01/2013')!.indicadores).toEqual([
      'PSC-MEN-SM-EC103',
    ]);
    expect(w).toEqual([]);
  });

  it('junta também quando as duas metades caem na mesma célula', () => {
    // Mesmo corte, mas com as metades perto o bastante para virarem uma célula só:
    // celulasPorGrupo junta com espaço, e "PSC-MEN-SM- EC103" não é o código do CNIS.
    const mesmaCelula = itens.map((i) =>
      i.page === 2 && i.str === 'EC103' ? { ...i, y: 476, x: 232 } : i,
    );
    const { extrato: e, warnings: w } = montarExtrato(mesmaCelula);
    expect(remunerado(e, 4).remuneracoes.find((r) => r.competencia === '01/2013')!.indicadores).toEqual([
      'PSC-MEN-SM-EC103',
    ]);
    expect(w).toEqual([]);
  });
});

describe('montarExtrato — casos de erro e aviso', () => {
  it('lança NAO_E_CNIS quando o documento não é um extrato CNIS', () => {
    try {
      montarExtrato([{ page: 1, x: 10, y: 10, str: 'Nota Fiscal' }]);
      expect.unreachable('deveria ter lançado CnisParseError');
    } catch (erro) {
      expect(erro).toBeInstanceOf(CnisParseError);
      expect((erro as CnisParseError).codigo).toBe('NAO_E_CNIS');
    }
  });

  it('emite CELULA_ORFA quando a competência existe sem valor legível', () => {
    const semValor = itens.filter((i) => i.str !== '366,67');
    const { warnings: w } = montarExtrato(semValor);
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'CELULA_ORFA', pagina: 1, seq: 1, detalhe: expect.stringContaining('03/2007') }),
    ]);
  });

  it('emite COMPETENCIA_DUPLICADA e mantém os dois registros', () => {
    const duplicado = itens.map((i) => (i.page === 1 && i.str === '04/2007' ? { ...i, str: '03/2007' } : i));
    const { extrato: e, warnings: w } = montarExtrato(duplicado);
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'COMPETENCIA_DUPLICADA', seq: 1, detalhe: expect.stringContaining('03/2007') }),
    ]);
    expect(remunerado(e, 1).remuneracoes.filter((r) => r.competencia === '03/2007')).toHaveLength(2);
  });

  it('emite LAYOUT_DESCONHECIDO quando o cabeçalho da tabela CLT muda', () => {
    const alterado = itens.map((i) =>
      i.page === 1 && i.str === 'Remuneração' && i.x === 131 ? { ...i, str: 'Valor' } : i,
    );
    const { extrato: e, warnings: w } = montarExtrato(alterado);
    // Sem cabeçalho reconhecido o vínculo 1 fica sem tabela: natureza inferida do tipo de filiado.
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', pagina: 1, seq: 1 }),
      // As 16 competências do vínculo 1 ficaram de fora: o usuário tem que saber o tamanho.
      expect.objectContaining({ codigo: 'BLOCO_PULADO', detalhe: expect.stringContaining('16 competência') }),
      expect.objectContaining({ codigo: 'NATUREZA_INDEFINIDA', pagina: 1, seq: 1 }),
    ]);
    expect(remunerado(e, 1).remuneracoes).toEqual([]);
  });
});

describe('montarExtrato — vínculo ilegível', () => {
  it('emite LAYOUT_DESCONHECIDO e não classifica como não-CLT quando o tipo de filiado não é lido', () => {
    const alterado = itens.map((i) => (i.page === 1 && i.str === 'Vínculo' && i.x === 582 ? { ...i, str: 'Outro' } : i));
    const { extrato: e, warnings: w } = montarExtrato(alterado);
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', pagina: 1 }),
      expect.objectContaining({ codigo: 'BLOCO_PULADO', detalhe: expect.stringContaining('16 competência') }),
    ]);
    expect(e.vinculos.map((v) => v.seq)).toEqual([2, 3, 4, 5]);
    expect(e.vinculos.filter((v) => v.natureza !== 'CLT').map((v) => v.seq)).toEqual([2, 3, 5]);
  });
});

describe('montarExtrato — tipo de filiado não reconhecido', () => {
  const trocar = (de: string, para: string) => itens.map((i) => (i.page === 1 && i.str === de ? { ...i, str: para } : i));

  it('sonda 1: grafia desconhecida de vínculo de empregado vira LAYOUT_DESCONHECIDO, não NAO_CLT', () => {
    const { extrato: e, warnings: w } = montarExtrato(trocar('Empregado ou Agente', 'Empregado Doméstico'));
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', pagina: 1, seq: 1, detalhe: expect.stringContaining('Empregado Doméstico Público') }),
      expect.objectContaining({ codigo: 'BLOCO_PULADO', detalhe: expect.stringContaining('16 competência') }),
    ]);
    expect(e.vinculos.map((v) => v.seq)).toEqual([2, 3, 4, 5]);
    expect(e.vinculos.filter((v) => v.natureza !== 'CLT').map((v) => v.seq)).toEqual([2, 3, 5]);
  });

  it('sonda 2: quebra de linha diferente que deixa o tipo truncado vira LAYOUT_DESCONHECIDO', () => {
    const { extrato: e, warnings: w } = montarExtrato(trocar('Empregado ou Agente', 'Empregado ou'));
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', seq: 1 }),
      expect.objectContaining({ codigo: 'BLOCO_PULADO', detalhe: expect.stringContaining('16 competência') }),
    ]);
    expect(e.vinculos.map((v) => v.seq)).toEqual([2, 3, 4, 5]);
    expect(e.vinculos.filter((v) => v.natureza !== 'CLT').map((v) => v.seq)).toEqual([2, 3, 5]);
  });

  it('uma quebra de linha em outro ponto do mesmo texto continua sendo CLT', () => {
    const outraQuebra = trocar('Empregado ou Agente', 'Empregado ou').map((i) =>
      i.page === 1 && i.str === 'Público' ? { ...i, str: 'Agente Público' } : i,
    );
    const { extrato: e, warnings: w } = montarExtrato(outraQuebra);
    expect(w).toEqual([]);
    expect(e.vinculos.map((v) => v.seq)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('montarExtrato — seq obrigatório', () => {
  it('sem seq legível emite LAYOUT_DESCONHECIDO, pula o vínculo e não registra seq 0', () => {
    const semSeq = itens.filter((i) => !(i.page === 1 && i.str === '1' && i.x === 42 && i.y === 214));
    const { extrato: e, warnings: w } = montarExtrato(semSeq);
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', pagina: 1 }),
      expect.objectContaining({ codigo: 'BLOCO_PULADO', detalhe: expect.stringContaining('16 competência') }),
    ]);
    expect(e.vinculos.map((v) => v.seq)).toEqual([2, 3, 4, 5]);
    expect(e.vinculos.every((v) => v.seq > 0)).toBe(true);
  });
});

describe('montarExtrato — célula deslocada', () => {
  it('uma linha de dados com o valor na coluna da competência gera CELULA_ORFA em vez de sumir', () => {
    const deslocado = itens.map((i) => (i.page === 1 && i.str === '366,67' ? { ...i, x: 70 } : i));
    const { extrato: e, warnings: w } = montarExtrato(deslocado);
    expect(w).toEqual([
      expect.objectContaining({ codigo: 'CELULA_ORFA', pagina: 1, seq: 1, detalhe: expect.stringContaining('03/2007 366,67') }),
    ]);
    expect(remunerado(e, 1).remuneracoes).toHaveLength(15);
  });
});
