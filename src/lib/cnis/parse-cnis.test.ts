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
      expect.objectContaining({ codigo: 'NATUREZA_INDEFINIDA', pagina: 1, seq: 1 }),
    ]);
    expect(remunerado(e, 1).remuneracoes).toEqual([]);
  });
});

describe('montarExtrato — vínculo ilegível', () => {
  it('emite LAYOUT_DESCONHECIDO e não classifica como não-CLT quando o tipo de filiado não é lido', () => {
    const alterado = itens.map((i) => (i.page === 1 && i.str === 'Vínculo' && i.x === 582 ? { ...i, str: 'Outro' } : i));
    const { extrato: e, warnings: w } = montarExtrato(alterado);
    expect(w).toEqual([expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', pagina: 1 })]);
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
    ]);
    expect(e.vinculos.map((v) => v.seq)).toEqual([2, 3, 4, 5]);
    expect(e.vinculos.filter((v) => v.natureza !== 'CLT').map((v) => v.seq)).toEqual([2, 3, 5]);
  });

  it('sonda 2: quebra de linha diferente que deixa o tipo truncado vira LAYOUT_DESCONHECIDO', () => {
    const { extrato: e, warnings: w } = montarExtrato(trocar('Empregado ou Agente', 'Empregado ou'));
    expect(w).toEqual([expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', seq: 1 })]);
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
    expect(w).toEqual([expect.objectContaining({ codigo: 'LAYOUT_DESCONHECIDO', pagina: 1 })]);
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
