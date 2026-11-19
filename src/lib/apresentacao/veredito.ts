import type { ResultadoCompetencia, ResultadoTeto } from '@/lib/teto';

/**
 * Os dois vereditos da tela, derivados da saída do motor.
 *
 * A tela tem **dois** resultados, não um, e eles têm ritos diferentes:
 *
 * - **a sangria atual** — o desconto a mais que continua acontecendo. Se resolve com a
 *   declaração de múltiplos vínculos ao RH (Anexo VIII da IN RFB 2.110/2022), que é
 *   **prospectiva**: não devolve nada do passado;
 * - **o acumulado** — o que já foi descontado a mais. Se pede mês a mês no PER/DCOMP Web,
 *   no e-CAC, e só dos meses dentro dos cinco anos.
 *
 * Confundir os dois é o risco número um desta tela, e é por isso que eles são tipos
 * separados aqui.
 */

/** O que o professor respondeu sobre o mês, conferindo contra o PDF. */
export type Marca = 'bate' | 'naoBate';
/** Chave é a competência (`"08/2024"`). Ausência significa **sem marca**, não "não bate". */
export type Marcas = Readonly<Record<string, Marca>>;

export type Sangria =
  /** O último mês lido tem desconto a mais. `defasado` = extrato velho, pode não valer hoje. */
  | { tipo: 'ativa'; competencia: string; centavos: number; defasado: boolean }
  /** O último mês não excedeu, mas algum dos 12 anteriores excedeu. Nenhuma afirmação sobre hoje. */
  | { tipo: 'recente'; competencia: string }
  /** O professor marcou o último mês como divergente: não afirmamos o que ele nega. */
  | { tipo: 'divergente'; competencia: string }
  /** Há meses avaliados e nenhum excedeu. */
  | { tipo: 'nenhuma' }
  /** Nenhuma competência avaliada. Dizer "não passou do teto" aqui seria mentira. */
  | { tipo: 'nadaAvaliado' };

export type Acumulado = {
  totalAPedirCentavos: number;
  mesesAPedir: number;
  totalPrescritoCentavos: number;
  mesesPrescritos: number;
  mesesUrgentes: number;
  competenciasDivergentes: string[];
};

export type Veredito = {
  sangria: Sangria;
  acumulado: Acumulado;
  mesesComMultiplosVinculos: number;
};

/** Meses desde o ano 0, para comparar competências sem passar por `Date`. */
function ordinal(competencia: string): number {
  const [mes, ano] = competencia.split('/');
  // O 13º é pago em dezembro: para distância no tempo, vale como 12.
  return Number(ano) * 12 + Math.min(Number(mes), 12);
}

/** Idem para a data de referência, que vem como `AAAA-MM-DD`. */
function ordinalDaData(dataReferencia: string): number {
  const [ano, mes] = dataReferencia.split('-');
  return Number(ano) * 12 + Number(mes);
}

/** Mais de 4 meses entre o último mês do extrato e hoje: o CNIS atrasa, e a tela admite. */
const MESES_DE_DEFASAGEM = 4;
/** Janela do "você passou do teto recentemente". */
const MESES_DA_JANELA_RECENTE = 12;

function derivarSangria(teto: ResultadoTeto, marcas: Marcas): Sangria {
  if (teto.competencias.length === 0) return { tipo: 'nadaAvaliado' };

  const mensais = teto.competencias.filter((c) => !c.decimoTerceiro);
  // Extrato só com 13º é possível em teoria; aí o mais recente de todos serve.
  const candidatas = mensais.length > 0 ? mensais : teto.competencias;
  const ultima = candidatas.reduce((maior, c) =>
    ordinal(c.competencia) > ordinal(maior.competencia) ? c : maior,
  );

  if (marcas[ultima.competencia] === 'naoBate') {
    return { tipo: 'divergente', competencia: ultima.competencia };
  }

  if (ultima.retidoAMaiorCentavos > 0) {
    return {
      tipo: 'ativa',
      competencia: ultima.competencia,
      centavos: ultima.retidoAMaiorCentavos,
      defasado:
        ordinalDaData(teto.dataReferencia) - ordinal(ultima.competencia) > MESES_DE_DEFASAGEM,
    };
  }

  const limite = ordinal(ultima.competencia) - MESES_DA_JANELA_RECENTE;
  const houveExcessoRecente = teto.competencias.some(
    (c) =>
      c.retidoAMaiorCentavos > 0 &&
      ordinal(c.competencia) >= limite &&
      marcas[c.competencia] !== 'naoBate',
  );

  return houveExcessoRecente
    ? { tipo: 'recente', competencia: ultima.competencia }
    : { tipo: 'nenhuma' };
}

function derivarAcumulado(teto: ResultadoTeto, marcas: Marcas): Acumulado {
  const comValor = (c: ResultadoCompetencia) => c.retidoAMaiorCentavos > 0;
  const divergente = (c: ResultadoCompetencia) => marcas[c.competencia] === 'naoBate';

  // Recomposto, nunca subtraído do `resumo` do motor: um teste de invariante exige que, sem
  // marca nenhuma, o resultado daqui seja idêntico ao do motor. Se um dia divergirem, o
  // teste quebra antes de a tela exibir um número que o motor não assina.
  const consideradas = teto.competencias.filter((c) => comValor(c) && !divergente(c));
  const noPrazo = consideradas.filter((c) => c.prescricao.noPrazo);
  const prescritas = consideradas.filter((c) => !c.prescricao.noPrazo);
  const somar = (lista: ResultadoCompetencia[]) =>
    lista.reduce((total, c) => total + c.retidoAMaiorCentavos, 0);

  return {
    totalAPedirCentavos: somar(noPrazo),
    mesesAPedir: noPrazo.length,
    totalPrescritoCentavos: somar(prescritas),
    mesesPrescritos: prescritas.length,
    mesesUrgentes: noPrazo.filter((c) => c.prescricao.urgente).length,
    competenciasDivergentes: teto.competencias.filter(divergente).map((c) => c.competencia),
  };
}

export function derivarVeredito(teto: ResultadoTeto, marcas: Marcas): Veredito {
  return {
    sangria: derivarSangria(teto, marcas),
    acumulado: derivarAcumulado(teto, marcas),
    // Vem do motor sem recomposição: a marca do professor diz que nosso **valor** está
    // errado, não que o mês deixou de ter dois vínculos.
    mesesComMultiplosVinculos: teto.resumo.mesesComMultiplosVinculos,
  };
}
