'use client';

import { useState } from 'react';
import type { ParseResult } from '@/lib/cnis';
import type { ResultadoTeto } from '@/lib/teto';
import type { Marca, Marcas } from '@/lib/apresentacao/veredito';
import { Conferencia } from './conferencia';
import { Veredito } from './veredito';

/**
 * As duas telas da F3 e o estado que elas compartilham.
 *
 * **Sem rota e sem storage**, de propósito: levar o `ResultadoTeto` por navegação exigiria
 * `sessionStorage` — PII fora da memória volátil, contra a garantia que fez o professor
 * subir o arquivo — ou um Context que se perde no refresh, e aí a URL mentiria. Refresh
 * volta ao início, como o extrato. A F4 entra como a terceira vista.
 *
 * As marcas de conferência moram aqui porque as duas telas as usam: a conferência as
 * escreve, o veredito as desconta do total a pedir.
 */
export function TelasDoResultado({
  parse,
  teto,
}: {
  parse: ParseResult;
  teto: ResultadoTeto;
}) {
  const [vista, setVista] = useState<'veredito' | 'conferencia'>('veredito');
  const [marcas, setMarcas] = useState<Marcas>({});

  const marcar = (competencia: string, marca: Marca) =>
    setMarcas((atuais) => ({ ...atuais, [competencia]: marca }));

  return vista === 'veredito' ? (
    <Veredito
      teto={teto}
      parse={parse}
      marcas={marcas}
      onConferir={() => setVista('conferencia')}
    />
  ) : (
    <Conferencia
      teto={teto}
      extrato={parse.extrato}
      marcas={marcas}
      onMarcar={marcar}
      onVoltar={() => setVista('veredito')}
    />
  );
}
