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

const PARSE_VAZIO: ParseResult = { extrato: { filiado: {}, vinculos: [] }, warnings: [] };

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

  it('junta os indicadores do INSS num aviso só, com os códigos como o INSS escreve', () => {
    const parse: ParseResult = {
      extrato: {
        filiado: {},
        vinculos: [vinculo(1, ['PREM-EXT']), vinculo(2, ['IREM-INDPEND', 'IRE-INSS']), vinculo(3)],
      },
      warnings: [],
    };
    const doInss = avisosExibiveis(parse, TETO_VAZIO).filter((a) => a.origem === 'inss');
    expect(doInss).toHaveLength(1);
    expect(doInss[0].detalhe).toContain('PREM-EXT');
    expect(doInss[0].detalhe).toContain('IRE-INSS');
    expect(doInss[0].gravidade).toBe('media');
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
    expect(aviso.detalhe).toBe('09/2026: PREM-EXT');
  });

  it('extrato sem aviso nenhum devolve lista vazia', () => {
    expect(avisosExibiveis(PARSE_VAZIO, TETO_VAZIO)).toEqual([]);
  });
});
