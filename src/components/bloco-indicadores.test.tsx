// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { IndicadorExibivel } from '@/lib/apresentacao/indicadores';
import { BlocoIndicadores } from './bloco-indicadores';

const MEI: IndicadorExibivel = {
  codigo: 'IREC-MEI',
  descricao: 'Indica que a contribuição da competência foi recolhida com código MEI',
  onde: '01/2022 a 12/2022, 12 meses',
  meses: 12,
  classificado: true,
};

describe('BlocoIndicadores', () => {
  afterEach(cleanup);

  it('não ocupa espaço nenhum quando não há indicador informativo', () => {
    const { container } = render(<BlocoIndicadores indicadores={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('nega, em texto, que isto seja pendência', () => {
    render(<BlocoIndicadores indicadores={[MEI]} />);
    expect(screen.getByText(/não é pendência/i)).toBeTruthy();
  });

  it('mostra a descrição do INSS e onde ela vale, uma linha por indicador', () => {
    render(<BlocoIndicadores indicadores={[MEI]} />);
    expect(screen.getByText(MEI.descricao)).toBeTruthy();
    expect(screen.getByText('01/2022 a 12/2022, 12 meses')).toBeTruthy();
  });

  it('nasce fechado: é contexto, não ação', () => {
    const { container } = render(<BlocoIndicadores indicadores={[MEI]} />);
    expect(container.querySelector('details')!.open).toBe(false);
  });

  it('sem descrição na legenda, mostra o código cru em vez de inventar texto', () => {
    render(<BlocoIndicadores indicadores={[{ ...MEI, descricao: '' }]} />);
    expect(screen.getByText('IREC-MEI')).toBeTruthy();
  });
});
