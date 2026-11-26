import { describe, expect, it } from 'vitest';
import type { CnisExtrato, LegendaIndicador } from '@/lib/cnis';
import { indicadoresExibiveis } from './indicadores';

const LEGENDA: LegendaIndicador[] = [
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
];

const proprio = (seq: number, meses: [string, string[]][], indicadores?: string[]): CnisExtrato['vinculos'][number] => ({
  seq,
  tipoFiliado: 'Contribuinte Individual',
  natureza: 'CI_PROPRIO',
  ...(indicadores ? { indicadores } : {}),
  contribuicoes: meses.map(([competencia, ind]) => ({
    competencia,
    contribuicaoCentavos: 5225,
    salarioContribuicaoCentavos: 104500,
    indicadores: ind,
  })),
});

const extratoCom = (vinculos: CnisExtrato['vinculos'], legenda = LEGENDA): CnisExtrato => ({
  filiado: {},
  vinculos,
  legenda,
});

const MEI_12_MESES: [string, string[]][] = Array.from({ length: 12 }, (_, i) => [
  `${String(i + 1).padStart(2, '0')}/2022`,
  ['IREC-LC123', 'IREC-MEI'],
]);

describe('indicadoresExibiveis', () => {
  it('separa o que o motor consome do que é pendência de verdade', () => {
    const { informativos, avisos } = indicadoresExibiveis(
      extratoCom([proprio(2, MEI_12_MESES, ['IREC-INDPEND'])]),
    );
    expect(informativos.map((i) => i.codigo).sort()).toEqual(['IREC-LC123', 'IREC-MEI']);
    expect(avisos.map((i) => i.codigo)).toEqual(['IREC-INDPEND']);
  });

  it('usa a descrição que o INSS escreveu na legenda do extrato', () => {
    const { informativos } = indicadoresExibiveis(extratoCom([proprio(2, MEI_12_MESES)]));
    expect(informativos.find((i) => i.codigo === 'IREC-MEI')?.descricao).toBe(
      'Indica que a contribuição da competência foi recolhida com código MEI',
    );
  });

  it('agrupa por código: um item por indicador, não um por mês', () => {
    const { informativos } = indicadoresExibiveis(extratoCom([proprio(2, MEI_12_MESES)]));
    expect(informativos).toHaveLength(2);
    expect(informativos[0].meses).toBe(12);
  });

  it('resume muitos meses como intervalo, e poucos como lista', () => {
    const { informativos, avisos } = indicadoresExibiveis(
      extratoCom([
        proprio(2, [
          ...MEI_12_MESES,
          ['01/2023', ['PSC-MEN-SM-EC103']],
          ['06/2023', ['PSC-MEN-SM-EC103']],
        ]),
      ]),
    );
    expect(informativos.find((i) => i.codigo === 'IREC-MEI')?.onde).toBe(
      '01/2022 a 12/2022, 12 meses',
    );
    expect(avisos.find((i) => i.codigo === 'PSC-MEN-SM-EC103')?.onde).toBe('01/2023 e 06/2023');
  });

  it('nomeia o vínculo quando o indicador é do vínculo, não da competência', () => {
    const { avisos } = indicadoresExibiveis(
      extratoCom([proprio(2, [], ['IREC-INDPEND']), proprio(3, [], ['IREC-INDPEND'])]),
    );
    expect(avisos.find((i) => i.codigo === 'IREC-INDPEND')?.onde).toBe('vínculos 2 e 3');
  });

  it('código fora da nossa classificação vira aviso — falhar aberto', () => {
    const { informativos, avisos } = indicadoresExibiveis(
      extratoCom([proprio(2, [['03/2024', ['XPTO-NOVO']]])], [
        { codigo: 'XPTO-NOVO', descricao: 'Coisa que o INSS inventou depois' },
      ]),
    );
    expect(informativos).toEqual([]);
    expect(avisos[0]).toMatchObject({
      codigo: 'XPTO-NOVO',
      descricao: 'Coisa que o INSS inventou depois',
      classificado: false,
    });
  });

  it('sem legenda no extrato, mostra o código cru e não inventa descrição', () => {
    const { informativos } = indicadoresExibiveis(extratoCom([proprio(2, MEI_12_MESES)], []));
    const mei = informativos.find((i) => i.codigo === 'IREC-MEI');
    expect(mei?.descricao).toBe('');
    // Continua informativo: a classificação é nossa, por código, e não depende da legenda.
    expect(mei).toBeDefined();
  });

  it('extrato sem indicador nenhum não produz nada', () => {
    const { informativos, avisos } = indicadoresExibiveis(extratoCom([proprio(2, [['03/2024', []]])]));
    expect(informativos).toEqual([]);
    expect(avisos).toEqual([]);
  });
});
