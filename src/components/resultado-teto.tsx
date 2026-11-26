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
  onOutroExtrato,
}: {
  parse: ParseResult;
  teto: ResultadoTeto;
  /** Descarta o extrato lido e volta ao upload. Ver o comentário do botão. */
  onOutroExtrato: () => void;
}) {
  const [vista, setVista] = useState<'veredito' | 'conferencia'>('veredito');
  const [marcas, setMarcas] = useState<Marcas>({});

  const marcar = (competencia: string, marca: Marca) =>
    setMarcas((atuais) => ({ ...atuais, [competencia]: marca }));

  return (
    <div className="flex flex-col gap-6">
      {vista === 'veredito' ? (
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
      )}

      {/*
        Quem sobe o PDF errado — extrato do cônjuge, extrato antigo — não tinha saída: a
        dropzone desaparece no estado de resultado, e recarregar a página não é óbvio para o
        público desta ferramenta. Pior: o extrato lido, com nome, CPF e NIT, continuava em
        memória sem forma de descartar pela interface, numa tela cujo argumento central é
        controle do próprio dado. Vale nas duas vistas.
      */}
      <button
        type="button"
        onClick={onOutroExtrato}
        className="no-print self-start text-base underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        Descartar e ler outro extrato
      </button>
    </div>
  );
}
