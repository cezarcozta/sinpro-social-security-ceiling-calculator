/**
 * `Date` → `"AAAA-MM-DD"` na **data local**, que é a forma que o motor espera em
 * `dataReferencia`.
 *
 * `toISOString()` devolve UTC: às 21h de São Paulo ele já está no dia seguinte. A prescrição
 * se decide no dia (`noPrazo = dataReferencia <= prescreveEm`), então um dia de diferença
 * tira ou acrescenta um mês inteiro de prazo ao professor.
 */
export function dataReferenciaLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}
