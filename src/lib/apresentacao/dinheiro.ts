/**
 * Único lugar do projeto onde dinheiro deixa de ser centavos inteiros.
 *
 * O resto da camada de apresentação e todos os componentes são proibidos de importar isto
 * diretamente (regra `no-restricted-imports` no `eslint.config.mjs`): dinheiro na tela passa
 * pelo componente `Dinheiro`, que exige natureza e elegibilidade. A razão é a §9 da spec da
 * F2 — "nunca um número sozinho".
 */

/**
 * Centavos inteiros → `"R$ 1.234,56"`.
 *
 * Aritmética inteira, como no motor: `(abs - abs % 100) / 100` é divisão exata, e a parte
 * dos centavos sai do resto. Nenhuma fração é materializada.
 *
 * `Intl.NumberFormat` foi descartado de propósito: ele separa `R$` do número com espaço
 * ininterrupto (` `) em alguns runtimes e espaço comum em outros, o que torna o teste
 * dependente da versão do Node e a busca por texto na tela dependente de qual espaço o
 * navegador usou.
 *
 * @throws RangeError se `centavos` não for inteiro — é erro de programação, não entrada de
 * usuário: o motor garante inteiros em todo campo `*Centavos`.
 */
export function formatarCentavos(centavos: number): string {
  if (!Number.isInteger(centavos)) {
    throw new RangeError(`formatarCentavos espera centavos inteiros, recebeu ${centavos}`);
  }

  const sinal = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  const reais = (abs - (abs % 100)) / 100;
  const resto = abs % 100;

  const inteira = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fracao = String(resto).padStart(2, '0');

  return `${sinal}R$ ${inteira},${fracao}`;
}
