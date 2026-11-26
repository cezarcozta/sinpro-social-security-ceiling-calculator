import { describe, expect, it } from 'vitest';
import { avisosExibiveis, FRASES } from './avisos';
import type { ParseResult, Vinculo } from '@/lib/cnis';
import type { AvisoTeto, ResultadoTeto } from '@/lib/teto';

const TETO_VAZIO: ResultadoTeto = {
  dataReferencia: '2026-11-19',
  competencias: [],
  ignoradasSemTabela: [],
  achados: [],
  avisos: [],
  resumo: {
    mesesComMultiplosVinculos: 0,
    mesesAcimaDoTeto: 0,
    totalAPedirCentavos: 0,
    totalPrescritoCentavos: 0,
  },
};

const PARSE_VAZIO: ParseResult = { extrato: { filiado: {}, vinculos: [], legenda: [] }, warnings: [] };

const vinculo = (seq: number, indicadores?: string[]): Vinculo => ({
  seq,
  tipoFiliado: 'Empregado',
  natureza: 'CLT',
  remuneracoes: [],
  ...(indicadores ? { indicadores } : {}),
});

describe('avisosExibiveis', () => {
  it('tem frase própria para todos os códigos conhecidos', () => {
    const entradas = Object.entries(FRASES);
    expect(entradas.length).toBe(13);
    for (const [codigo, { frase }] of entradas) {
      expect(frase.length).toBeGreaterThan(20);
      expect(frase).not.toContain(codigo);
    }
    const frases = entradas.map(([, v]) => v.frase);
    expect(new Set(frases).size).toBe(frases.length);
  });

  it('ordena gravidade alta antes de media, qualquer que seja a ordem de entrada', () => {
    const parse: ParseResult = {
      ...PARSE_VAZIO,
      warnings: [
        { codigo: 'CELULA_ORFA', pagina: 2, detalhe: 'celula solta' },
        { codigo: 'BLOCO_PULADO', pagina: 3, detalhe: '4 competencias' },
      ],
    };
    expect(avisosExibiveis(parse, TETO_VAZIO).map((a) => a.codigo)).toEqual([
      'BLOCO_PULADO',
      'CELULA_ORFA',
    ]);
  });

  it('código desconhecido vira frase genérica, com o código visível e gravidade alta', () => {
    const teto: ResultadoTeto = {
      ...TETO_VAZIO,
      avisos: [{ codigo: 'FUTURO_X', competencia: '01/2026', detalhe: 'd' } as unknown as AvisoTeto],
    };
    const [aviso] = avisosExibiveis(PARSE_VAZIO, teto);
    expect(aviso.codigo).toBe('FUTURO_X');
    expect(aviso.frase).toMatch(/não entendemos/i);
    expect(aviso.gravidade).toBe('alta');
    expect(aviso.origem).toBe('motor');
  });

  it('dá um aviso por indicador do INSS, agrupando os vínculos de cada um', () => {
    const parse: ParseResult = {
      extrato: {
        filiado: {},
        legenda: [],
        vinculos: [vinculo(1, ['PREM-EXT']), vinculo(2, ['IREM-INDPEND', 'PREM-EXT']), vinculo(3)],
      },
      warnings: [],
    };
    const doInss = avisosExibiveis(parse, TETO_VAZIO).filter((a) => a.origem === 'inss');
    expect(doInss.map((a) => a.codigo).sort()).toEqual(['IREM-INDPEND', 'PREM-EXT']);
    expect(doInss.find((a) => a.codigo === 'PREM-EXT')!.detalhe).toBe('vínculos 1 e 2');
    expect(doInss.every((a) => a.gravidade === 'media')).toBe(true);
  });

  it('sem legenda no extrato, o aviso do INSS sai com o código cru para conferir', () => {
    const parse: ParseResult = {
      extrato: { filiado: {}, legenda: [], vinculos: [vinculo(1, ['PREM-EXT'])] },
      warnings: [],
    };
    expect(avisosExibiveis(parse, TETO_VAZIO).find((a) => a.codigo === 'PREM-EXT')!.conhecido).toBe(
      false,
    );
  });

  it('com legenda, o aviso usa a descrição que o próprio INSS escreveu', () => {
    const parse: ParseResult = {
      extrato: {
        filiado: {},
        legenda: [{ codigo: 'PREM-EXT', descricao: 'Remuneração extemporânea' }],
        vinculos: [vinculo(1, ['PREM-EXT'])],
      },
      warnings: [],
    };
    const aviso = avisosExibiveis(parse, TETO_VAZIO).find((a) => a.codigo === 'PREM-EXT')!;
    expect(aviso.frase).toContain('Remuneração extemporânea');
    expect(aviso.conhecido).toBe(true);
  });

  it('não chama de pendência o regime de recolhimento que o motor consome', () => {
    const parse: ParseResult = {
      extrato: { filiado: {}, legenda: [], vinculos: [vinculo(1, ['IREC-MEI', 'IREC-LC123'])] },
      warnings: [],
    };
    expect(avisosExibiveis(parse, TETO_VAZIO).filter((a) => a.origem === 'inss')).toEqual([]);
  });

  it('diz a competência do aviso do motor e a página do aviso do parser', () => {
    const parse: ParseResult = {
      ...PARSE_VAZIO,
      warnings: [{ codigo: 'CABECALHO_REAPROVEITADO', pagina: 7, seq: 4, detalhe: 'x' }],
    };
    const teto: ResultadoTeto = {
      ...TETO_VAZIO,
      avisos: [{ codigo: 'BASE_AUSENTE', competencia: '03/2025', detalhe: 'y' }],
    };
    const avisos = avisosExibiveis(parse, teto);
    expect(avisos.find((a) => a.codigo === 'BASE_AUSENTE')!.contexto).toBe('competência 03/2025');
    expect(avisos.find((a) => a.codigo === 'CABECALHO_REAPROVEITADO')!.contexto).toBe(
      'página 7, vínculo 4',
    );
  });

  it('recolhe indicador de competência, não só de vínculo', () => {
    const parse: ParseResult = {
      extrato: {
        filiado: {},
        legenda: [],
        vinculos: [
          {
            seq: 1,
            tipoFiliado: 'Empregado',
            natureza: 'CLT',
            remuneracoes: [
              { competencia: '09/2026', valorCentavos: 700000, indicadores: ['PREM-EXT'] },
            ],
          },
        ],
      },
      warnings: [],
    };
    const [aviso] = avisosExibiveis(parse, TETO_VAZIO);
    expect(aviso.origem).toBe('inss');
    expect(aviso.codigo).toBe('PREM-EXT');
    // O `detalhe` é só onde aconteceu: o código vive em `codigo`, e a tela o imprime
    // quando não sabe descrevê-lo.
    expect(aviso.detalhe).toBe('09/2026');
  });

  it('extrato sem aviso nenhum devolve lista vazia', () => {
    expect(avisosExibiveis(PARSE_VAZIO, TETO_VAZIO)).toEqual([]);
  });
});

describe('avisosExibiveis — correções da revisão final', () => {
  it('marca o aviso desconhecido como não reconhecido, para a tela mostrar o código', () => {
    const teto: ResultadoTeto = {
      ...TETO_VAZIO,
      avisos: [{ codigo: 'FUTURO_X', competencia: '01/2026', detalhe: 'd' } as unknown as AvisoTeto],
    };
    expect(avisosExibiveis(PARSE_VAZIO, teto)[0].conhecido).toBe(false);
    const conhecido: ResultadoTeto = {
      ...TETO_VAZIO,
      avisos: [{ codigo: 'BASE_AUSENTE', competencia: '01/2026', detalhe: 'd' }],
    };
    expect(avisosExibiveis(PARSE_VAZIO, conhecido)[0].conhecido).toBe(true);
  });

  it('avisa quando a data do aparelho está fora do período das tabelas de teto', () => {
    const adiantado = avisosExibiveis(PARSE_VAZIO, { ...TETO_VAZIO, dataReferencia: '2099-01-01' });
    expect(adiantado[0].codigo).toBe('DATA_SUSPEITA');
    expect(adiantado[0].frase).toMatch(/data do seu (aparelho|dispositivo)/i);
    expect(adiantado[0].gravidade).toBe('alta');

    const atrasado = avisosExibiveis(PARSE_VAZIO, { ...TETO_VAZIO, dataReferencia: '2015-06-01' });
    expect(atrasado[0].codigo).toBe('DATA_SUSPEITA');
  });

  it('data dentro do período coberto não gera aviso', () => {
    expect(avisosExibiveis(PARSE_VAZIO, { ...TETO_VAZIO, dataReferencia: '2026-11-19' })).toEqual(
      [],
    );
  });
});
