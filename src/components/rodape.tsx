import type { ReactNode } from 'react';

/**
 * As duas frases que a §9 da spec da F2 marca como **rodapé permanente**: estimativa de
 * triagem, e nada sai do navegador.
 *
 * Ele aparece nas **duas** telas, e não leva `.no-print`. A conferência é a tela que vira
 * papel e sai do dispositivo: uma folha com cifras e sem a frase "não é cálculo oficial" é
 * exatamente o que a §9 existe para impedir. Ter o rodapé só no veredito era cumprir o
 * requisito no código e descumpri-lo no papel.
 */
export function Rodape(): ReactNode {
  return (
    <footer className="flex flex-col gap-1 border-t border-neutral-300 pt-4 text-sm text-neutral-800">
      <p>
        Este resultado é uma <strong>estimativa de triagem</strong>, não cálculo oficial nem
        parecer jurídico ou contábil. Confira os números contra o seu extrato antes de levar
        ao RH ou pedir restituição.
      </p>
      <p>
        Seu extrato <strong>não sai do seu navegador</strong>: a leitura e o cálculo acontecem
        no seu próprio dispositivo, sem envio para nenhum servidor.
      </p>
    </footer>
  );
}
