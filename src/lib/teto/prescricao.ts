import type { Prescricao } from './types';

const COMPETENCIA = /^(0[1-9]|1[0-3])\/(\d{4})$/;
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const UM_DIA = 86_400_000;

/** Dias desde a época, em UTC. Fuso e horário de verão não podem mover a virada de um dia. */
function emDias(ano: number, mes: number, dia: number): number {
  return Date.UTC(ano, mes - 1, dia) / UM_DIA;
}

const doisDigitos = (n: number): string => String(n).padStart(2, '0');

/**
 * Prazo de restituição da competência, contra uma `dataReferencia` injetada (`AAAA-MM-DD`).
 *
 * A prescrição corre **por pagamento**, não por ano civil: CTN art. 168, I, com a LC
 * 118/2005, que fixou o termo inicial na data de cada recolhimento. Cada mês tem o seu
 * prazo — é por isso que o motor não recorta "últimos 5 anos civis" e marca mês a mês.
 *
 * O recolhimento vence no dia 20 do mês seguinte à competência, e o "mês seguinte" **vira
 * o ano** quando MM = 12 — ignorar isso é um erro de um ano inteiro. Regra única, sem caso
 * especial: `13/AAAA` é tratado como `12/AAAA`, porque a gratificação é paga em dezembro e
 * recolhida com a competência de dezembro.
 *
 * `dataReferencia` nunca vem de `new Date()` aqui dentro: o teste tem que ser determinístico.
 */
export function prescricaoDe(competencia: string, dataReferencia: string): Prescricao | null {
  const casou = COMPETENCIA.exec(competencia);
  if (!casou) return null;

  const hoje = DATA.exec(dataReferencia);
  if (!hoje) throw new Error(`dataReferencia deve ser AAAA-MM-DD, recebi "${dataReferencia}"`);

  const mm = Number(casou[1]) === 13 ? 12 : Number(casou[1]);
  const ano = Number(casou[2]);

  const mesDoVencimento = (mm % 12) + 1;
  const anoDaPrescricao = ano + 5 + (mm === 12 ? 1 : 0);
  const prescreveEm = `${anoDaPrescricao}-${doisDigitos(mesDoVencimento)}-20`;

  const diasRestantes =
    emDias(anoDaPrescricao, mesDoVencimento, 20) -
    emDias(Number(hoje[1]), Number(hoje[2]), Number(hoje[3]));
  const noPrazo = diasRestantes >= 0;

  return { prescreveEm, noPrazo, diasRestantes, urgente: noPrazo && diasRestantes <= 90 };
}
