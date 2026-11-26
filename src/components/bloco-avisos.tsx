import type { ReactNode } from 'react';
import type { AvisoExibivel } from '@/lib/apresentacao/avisos';

/**
 * **Um** bloco de aviso, com as três origens juntas (parser, motor e indicadores do próprio
 * INSS), no topo da tela.
 *
 * Duas listas de aviso em lugares diferentes era o caminho para o professor não ler nenhuma.
 * E nada é suprimido para a tela ficar limpa: é a regra "falhar aberto" da §9 da spec da F2.
 */
export function BlocoAvisos({ avisos }: { avisos: AvisoExibivel[] }): ReactNode {
  if (avisos.length === 0) return null;

  return (
    <section
      role="alert"
      aria-label="Avisos sobre a leitura do extrato"
      className="rounded-md border border-amber-700 bg-amber-50 px-4 py-3 text-amber-950"
    >
      <h2 className="font-semibold">
        {avisos.length === 1
          ? 'Há 1 aviso sobre a leitura do seu extrato'
          : `Há ${avisos.length} avisos sobre a leitura do seu extrato`}
      </h2>
      <p className="mt-1 text-sm">
        O resultado abaixo pode estar incompleto. Confira estes pontos antes de usar os
        números.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {avisos.map((aviso, i) => (
          <li key={`${aviso.codigo}-${i}`} className="text-base">
            {aviso.frase}
            <span className="block text-sm text-amber-900">
              {aviso.contexto ? `${aviso.contexto} — ` : ''}
              {aviso.detalhe}
              {/* Código cru só quando a tela não conhece o aviso: é o que o professor tem
                  para identificar o caso, e sem ele o aviso é irreportável. Para código
                  conhecido, a sigla seria ruído. */}
              {aviso.conhecido ? '' : ` (código ${aviso.codigo})`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
