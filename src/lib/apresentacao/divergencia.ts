import type { ResultadoCompetencia } from '@/lib/teto';
import { formatarCentavos } from './dinheiro';
import type { FontePagadora } from './fontes';

/**
 * O texto que o professor copia quando diz que um mês **não bate** com o PDF dele.
 *
 * Nada é enviado automaticamente — é a pendência "canal de erro sem telemetria" da F1 na
 * forma mínima: sem backend, um layout novo de extrato só vira conhecimento se o professor
 * levar esse texto a alguém.
 *
 * O que entra foi decidido por Cesar em 19/11/2026: a competência, os valores que o motor
 * leu em cada fonte e o total que ele calculou — **sem nome, sem CPF, sem NIT**. É a opção
 * mais protetiva que ainda permite diagnosticar o defeito de leitura.
 *
 * O **código do empregador também fica fora**, decisão tomada na implementação: um CNPJ de
 * escola, para quem conhece a rede do Grande ABC, reidentifica o professor com facilidade.
 * As fontes saem numeradas (`fonte 1`, `fonte 2`), o que preserva o que interessa ao
 * diagnóstico — quantas fontes, quais valores, de que natureza.
 */
export function textoDivergencia(
  competencia: ResultadoCompetencia,
  fontes: FontePagadora[],
): string {
  const linhas = fontes.map(
    (fonte, i) =>
      `  fonte ${i + 1} (${fonte.lido ? 'lido do extrato' : 'estimado'}): ${formatarCentavos(
        fonte.valorCentavos,
      )}`,
  );

  return [
    'Divergência na leitura do meu extrato CNIS',
    '',
    `Competência: ${competencia.competencia}${competencia.decimoTerceiro ? ' (13º salário)' : ''}`,
    'O que a calculadora leu:',
    ...linhas,
    `  total do mês: ${formatarCentavos(competencia.somaBaseCentavos)}`,
    `  teto vigente: ${formatarCentavos(competencia.tetoCentavos)}`,
    `  retido a maior calculado: ${formatarCentavos(competencia.retidoAMaiorCentavos)}`,
    '',
    'Conferi contra o meu extrato e estes valores não batem.',
    '',
    'Este texto não contém meu nome, CPF, NIT nem o CNPJ dos empregadores.',
  ].join('\n');
}
