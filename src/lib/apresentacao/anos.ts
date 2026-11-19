import type { ResultadoCompetencia, ResultadoTeto } from '@/lib/teto';

/**
 * O agrupamento por ano civil que o motor deixou de propósito para a tela (§2.2 da spec da
 * F2: a prescrição corre por pagamento, não por ano, então o motor não emite `porAno`).
 *
 * Aqui o ano é só apresentação: um cartão por ano, do mais recente para o mais antigo,
 * porque o professor se interessa primeiro pelo que está acontecendo agora.
 */

export type GrupoAno = {
  ano: number;
  /** Crescente por mês; `13/AAAA` sempre por último. */
  meses: ResultadoCompetencia[];
  /** Competências distintas acima do teto — não registros. */
  mesesAcimaDoTeto: number;
  /** Só competências no prazo. */
  totalAPedirCentavos: number;
  totalPrescritoCentavos: number;
  temUrgente: boolean;
};

/** `"13/2024"` → `{ ano: 2024, mes: 13 }`. O 13 ordena depois do 12 por ser maior. */
function partes(competencia: string): { ano: number; mes: number } {
  const [mes, ano] = competencia.split('/');
  return { ano: Number(ano), mes: Number(mes) };
}

export function agruparPorAno(teto: ResultadoTeto): GrupoAno[] {
  const porAno = new Map<number, ResultadoCompetencia[]>();

  for (const competencia of teto.competencias) {
    const { ano } = partes(competencia.competencia);
    const lista = porAno.get(ano);
    if (lista) lista.push(competencia);
    else porAno.set(ano, [competencia]);
  }

  return [...porAno.entries()]
    .sort(([a], [b]) => b - a)
    .map(([ano, competencias]) => {
      const meses = [...competencias].sort(
        (a, b) => partes(a.competencia).mes - partes(b.competencia).mes,
      );

      return {
        ano,
        meses,
        mesesAcimaDoTeto: meses.filter((m) => m.excedeuTeto).length,
        totalAPedirCentavos: meses
          .filter((m) => m.prescricao.noPrazo)
          .reduce((soma, m) => soma + m.retidoAMaiorCentavos, 0),
        totalPrescritoCentavos: meses
          .filter((m) => !m.prescricao.noPrazo)
          .reduce((soma, m) => soma + m.retidoAMaiorCentavos, 0),
        temUrgente: meses.some((m) => m.prescricao.urgente),
      };
    });
}
