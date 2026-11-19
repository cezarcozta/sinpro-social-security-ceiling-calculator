import type { TabelaVigencia } from './types';

/**
 * As vigências da tabela de contribuição do empregado, em centavos e pontos-base.
 *
 * Ordenada por vigência crescente — `tabelaDe` depende dessa ordem. Cada entrada traz a
 * portaria de origem: é o dado de maior impacto do motor, e quem conferir no DOU precisa
 * saber o que conferir.
 *
 * ATENÇÃO: as cinco entradas do meio (2022 a 2025) vêm de fonte secundária. 2021 e 2026
 * foram conferidas direto no gov.br e a fonte secundária bate exatamente nas duas pontas.
 * Conferir as do meio nas portarias antes de o app ir ao ar — ver §10 da spec da F2.
 */
export const VIGENCIAS: readonly TabelaVigencia[] = [
  // Portaria SEPRT 477/2021
  { vigencia: '2021-01', tetoCentavos: 643357, faixas: [[110000, 750], [220348, 900], [330522, 1200], [643357, 1400]] },
  // Portaria MTP/ME 12/2022
  { vigencia: '2022-01', tetoCentavos: 708722, faixas: [[121200, 750], [242735, 900], [364103, 1200], [708722, 1400]] },
  // Portaria MPS/MF 26/2023
  { vigencia: '2023-01', tetoCentavos: 750749, faixas: [[130200, 750], [257129, 900], [385694, 1200], [750749, 1400]] },
  // Portaria MPS/MF 27/2023 — o salário mínimo mudou em maio; o teto não, só a 1ª faixa
  { vigencia: '2023-05', tetoCentavos: 750749, faixas: [[132000, 750], [257129, 900], [385694, 1200], [750749, 1400]] },
  // Portaria MPS/MF 2/2024
  { vigencia: '2024-01', tetoCentavos: 778602, faixas: [[141200, 750], [266668, 900], [400003, 1200], [778602, 1400]] },
  // Portaria MPS/MF 6/2025
  { vigencia: '2025-01', tetoCentavos: 815741, faixas: [[151800, 750], [279388, 900], [419083, 1200], [815741, 1400]] },
  // Portaria MPS/MF 13/2026
  { vigencia: '2026-01', tetoCentavos: 847555, faixas: [[162100, 750], [290284, 900], [435427, 1200], [847555, 1400]] },
];

const COMPETENCIA = /^(0[1-9]|1[0-3])\/(\d{4})$/;

/**
 * A cobertura termina em dezembro do ano da última vigência: uma vigência vale até o fim
 * do seu ano civil, e é a portaria do ano seguinte que a substitui. Derivar daqui, em vez
 * de uma constante à parte, é o que mantém "acrescentar 2027" em uma linha só.
 */
const ultimaCompetenciaCoberta = (): string => `${VIGENCIAS[VIGENCIAS.length - 1].vigencia.slice(0, 4)}-12`;

/**
 * Resolve a tabela vigente na competência `"MM/AAAA"` (MM pode ser 13).
 *
 * A chave é a **competência**, não o ano: 04/2023 e 05/2023 caem em vigências diferentes.
 * O 13º usa a tabela de dezembro do mesmo ano (a gratificação é paga em dezembro), o que
 * é consistente com o teto próprio da §6.2 — teto isolado, mas a mesma tabela.
 *
 * Devolve `null` para competência malformada ou fora do período coberto. Fora do período
 * **não é erro**: quem chama registra em `ignoradasSemTabela`.
 */
export function tabelaDe(competencia: string): TabelaVigencia | null {
  const casou = COMPETENCIA.exec(competencia);
  if (!casou) return null;

  const [, mm, ano] = casou;
  const mes = mm === '13' ? '12' : mm;
  const chave = `${ano}-${mes}`;
  if (chave > ultimaCompetenciaCoberta()) return null;

  let encontrada: TabelaVigencia | null = null;
  for (const tabela of VIGENCIAS) {
    if (tabela.vigencia > chave) break;
    encontrada = tabela;
  }
  return encontrada;
}
