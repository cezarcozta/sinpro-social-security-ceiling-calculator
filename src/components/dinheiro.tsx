import type { ReactNode } from 'react';
import { formatarCentavos } from '@/lib/apresentacao/dinheiro';

/**
 * Todo valor em dinheiro da tela passa por aqui, e as três props são **obrigatórias**: não
 * dá para renderizar dinheiro sem dizer o que ele é.
 *
 * É a §9 da spec da F2 virando estrutura em vez de lembrete — "nunca um número sozinho".
 * Um valor solto é o número que o professor leva ao RH. O `eslint.config.mjs` proíbe
 * importar `@/lib/apresentacao/dinheiro` em qualquer outro arquivo, para que não exista
 * caminho alternativo.
 *
 * Os rótulos são **texto**, nunca só cor: parte do público tem baixa visão, e cor sozinha
 * falha em impressão (a folha de impressão da conferência depende disso).
 */

export type Natureza =
  /** O CNIS informa a remuneração, não o desconto: o valor é simulado pela tabela progressiva. */
  | 'estimado'
  /** Valor escrito no extrato — o que o INSS registrou como pago (recolhimento próprio). */
  | 'lido'
  /** Aritmética exata, sem estimativa: soma, teto, base excedente. */
  | 'exato';

export type Elegibilidade = 'noPrazo' | 'prescrito' | 'naoSeAplica';

const NATUREZA: Record<Natureza, string> = {
  estimado: 'estimado',
  lido: 'lido do extrato',
  exato: 'valor exato',
};

const ELEGIBILIDADE: Record<Elegibilidade, string | null> = {
  noPrazo: 'no prazo',
  prescrito: 'prescrito',
  naoSeAplica: null,
};

export function Dinheiro({
  centavos,
  natureza,
  elegibilidade,
}: {
  centavos: number;
  natureza: Natureza;
  elegibilidade: Elegibilidade;
}): ReactNode {
  const prazo = ELEGIBILIDADE[elegibilidade];

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="whitespace-nowrap font-medium tabular-nums">
        {formatarCentavos(centavos)}
      </span>
      <span className="text-sm text-neutral-700">
        {NATUREZA[natureza]}
        {prazo ? ` · ${prazo}` : ''}
      </span>
    </span>
  );
}
