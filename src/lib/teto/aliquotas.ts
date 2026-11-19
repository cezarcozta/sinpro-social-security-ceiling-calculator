import type { TabelaVigencia } from './types';

/**
 * As DUAS únicas funções do motor onde aparecem `*` e `/` com dinheiro são `aplicar` e
 * `bpsDe`. Em nenhum outro lugar de `src/lib/teto/`. Ver §5 da spec da F2.
 */

/**
 * Aplica uma alíquota a uma base. `base` em centavos inteiros, `bps` em pontos-base
 * (750 = 7,5%). Devolve centavos inteiros, arredondados meio-para-cima.
 *
 * Esta forma, e **não** `Math.floor(bruto / 10000)`: `%` e `-` sobre inteiros abaixo de
 * 2^53 são exatos, e `bruto - (bruto % 10000)` é múltiplo exato de 10000, então a divisão
 * devolve um inteiro exatamente representável. Não depende do arredondamento do IEEE754.
 *
 * Magnitude: o maior produto possível do motor é 847555 × 1400 = 1.186.577.000, contra
 * MAX_SAFE_INTEGER = 9.007.199.254.740.991. ~7 ordens de grandeza de folga; BigInt seria
 * cerimônia.
 */
export function aplicar(base: number, bps: number): number {
  const bruto = base * bps + 5000; // +5000 = arredondamento meio-para-cima
  return (bruto - (bruto % 10000)) / 10000; // divisão exata: múltiplo de 10000
}

/**
 * Taxa efetiva em pontos-base, a partir de dois inteiros em centavos.
 *
 * É o que torna o recolhimento próprio uma **leitura** e não uma estimativa: a alíquota
 * sai da própria divisão (52,25 / 1.045,00 = 5%), e os indicadores do CNIS passam a servir
 * de conferência, não de fonte da verdade.
 */
export function bpsDe(contribuicao: number, base: number): number {
  if (base <= 0) return 0;
  const bruto = contribuicao * 10000 * 2 + base; // meio-para-cima sobre `base`
  const d = base * 2;
  return (bruto - (bruto % d)) / d;
}

/**
 * "O valor pago bate com a alíquota esperada, a menos de 1 centavo?"
 *
 * Por multiplicação cruzada inteira, nunca comparando com `0.05`.
 */
export function confere(contribuicao: number, base: number, bpsEsperado: number): boolean {
  return Math.abs(contribuicao - aplicar(base, bpsEsperado)) <= 1;
}

/**
 * Contribuição do empregado pela tabela progressiva: cada faixa incide só sobre a parte da
 * base que cai dentro dela.
 *
 * Arredonda **por faixa**, meio-para-cima, como faz folha de pagamento (§6.3). Os exemplos
 * de referência (518,82 e 908,86) saem idênticos arredondando por faixa ou só no fim, então
 * não distinguem as duas escolhas — é o teste de `141199` que fixa esta, para que ninguém a
 * troque por acidente.
 */
export function contribuicao(base: number, tabela: TabelaVigencia): number {
  let total = 0;
  let pisoAnterior = 0;

  for (const [topo, bps] of tabela.faixas) {
    if (base <= pisoAnterior) break;
    const dentroDaFaixa = Math.min(base, topo) - pisoAnterior;
    total += aplicar(dentroDaFaixa, bps);
    pisoAnterior = topo;
  }

  return total;
}
