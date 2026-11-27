import type { ReactNode } from 'react';
import type { IndicadorExibivel } from '@/lib/apresentacao/indicadores';

/**
 * Os indicadores do INSS que **não** são problema: o regime de recolhimento do professor,
 * que o motor leu e usou para derivar a alíquota.
 *
 * Fica fora do `BlocoAvisos` de propósito. Antes eles entravam lá, sob a frase "o INSS
 * marcou pendência", e o resultado era meia tela de aviso sobre o dado que a conta
 * entendeu — ruído que ensina o professor a não ler aviso nenhum.
 *
 * Nasce fechado: é informação de contexto, não ação. Quem quiser conferir o que o INSS
 * registrou abre; quem não quiser não perde nada.
 */
export function BlocoIndicadores({ indicadores }: { indicadores: IndicadorExibivel[] }): ReactNode {
  if (indicadores.length === 0) return null;

  return (
    <details className="rounded-md border border-neutral-300 bg-neutral-50 px-4 py-3">
      <summary className="cursor-pointer font-medium">
        Como o INSS registrou os seus recolhimentos
      </summary>
      <p className="mt-2 text-sm text-neutral-800">
        Isto não é pendência: é a forma como cada contribuição foi recolhida. O cálculo já
        considera a alíquota de cada uma.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {indicadores.map((indicador) => (
          <li key={indicador.codigo} className="text-base">
            {/* Sem legenda no extrato não há o que traduzir: o código cru é honesto, e
                inventar uma descrição seria pior que não ter nenhuma. */}
            {indicador.descricao === '' ? indicador.codigo : indicador.descricao}
            <span className="block text-sm text-neutral-700">{indicador.onde}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
