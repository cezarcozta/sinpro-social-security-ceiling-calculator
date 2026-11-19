import type { ReactNode } from 'react';
import type { ParseResult } from '@/lib/cnis';
import type { ResultadoTeto } from '@/lib/teto';
import { avisosExibiveis } from '@/lib/apresentacao/avisos';
import { SINDICATO } from '@/lib/apresentacao/sindicato';
import { derivarVeredito, type Marcas } from '@/lib/apresentacao/veredito';
import { BlocoAvisos } from './bloco-avisos';
import { Dinheiro } from './dinheiro';

/**
 * A tela de veredito: dois resultados, dois próximos passos.
 *
 * A ordem é decisão de produto (Cesar, 19/11/2026): lidera **parar a sangria**, porque é a
 * ação mais barata para o professor — entregar um papel no RH — e a que o sindicato apoia
 * sem advogado. O acumulado vem abaixo, como o que já se perdeu.
 *
 * O risco número um desta tela é o professor achar que a carta ao RH devolve o passado. Por
 * isso cada bloco diz, no próprio texto, qual é o seu alcance.
 *
 * Esta função não calcula nada: tudo vem de `derivarVeredito` e `avisosExibiveis`, e todo
 * valor em dinheiro passa pelo `Dinheiro`, que exige natureza e elegibilidade.
 */
export function Veredito({
  teto,
  parse,
  marcas,
  onConferir,
}: {
  teto: ResultadoTeto;
  parse: ParseResult;
  marcas: Marcas;
  onConferir: () => void;
}): ReactNode {
  const { sangria, acumulado } = derivarVeredito(teto, marcas);
  const avisos = avisosExibiveis(parse, teto);
  const mesDaSangria = sangria.tipo === 'nenhuma' || sangria.tipo === 'nadaAvaliado' ? null : sangria.competencia;
  const competenciaDaSangria = mesDaSangria
    ? teto.competencias.find((c) => c.competencia === mesDaSangria)
    : undefined;
  const mei = teto.achados.find((a) => a.tipo === 'MEI_DAS_INDEVIDO');

  return (
    <div className="flex flex-col gap-6">
      <BlocoAvisos avisos={avisos} />

      <section
        aria-labelledby="titulo-sangria"
        className="rounded-lg border border-neutral-400 p-4 sm:p-5"
      >
        <h2 id="titulo-sangria" className="text-xl font-semibold">
          {sangria.tipo === 'ativa'
            ? 'Você está pagando INSS a mais'
            : sangria.tipo === 'recente'
              ? 'Você passou do teto recentemente'
              : sangria.tipo === 'divergente'
                ? 'Você marcou este mês como divergente'
                : sangria.tipo === 'nenhuma'
                  ? 'Não encontramos mês acima do teto'
                  : 'Não foi possível avaliar seu extrato'}
        </h2>

        {sangria.tipo === 'ativa' && (
          <>
            <p className="mt-2 text-base">
              No último mês do seu extrato ({sangria.competencia}), a soma dos seus vínculos
              passou do teto do INSS e você pagou a mais:
            </p>
            <p className="mt-2 text-2xl">
              <Dinheiro centavos={sangria.centavos} natureza="estimado" elegibilidade="naoSeAplica" />
            </p>
            {competenciaDaSangria && (
              <p className="mt-2 text-sm text-neutral-800">
                A parte do salário que passou do teto nesse mês é{' '}
                <Dinheiro
                  centavos={competenciaDaSangria.baseExcedenteCentavos}
                  natureza="exato"
                  elegibilidade="naoSeAplica"
                />{' '}
                — essa conta é exata. Só o valor em dinheiro é estimativa, porque o extrato
                informa quanto você ganhou, não quanto cada fonte descontou.
              </p>
            )}
            {sangria.defasado && (
              <p className="mt-2 text-sm text-neutral-800">
                Atenção: seu extrato vai até {sangria.competencia}. Se você mudou de escola
                depois disso, confira antes de usar este número.
              </p>
            )}
            <p className="mt-3 text-base">
              Isso se repete todo mês enquanto a situação for a mesma. Para interromper{' '}
              <strong>a partir do próximo salário</strong>, entregue uma declaração de
              múltiplos vínculos à escola que desconta por último.{' '}
              <strong>
                Essa declaração não devolve o que já foi descontado — ela só vale para os
                próximos meses.
              </strong>
            </p>
            <div className="mt-3 flex flex-col gap-1">
              <button
                type="button"
                disabled
                className="self-start rounded-md bg-neutral-300 px-4 py-2 text-base font-medium text-neutral-700"
              >
                Gerar declaração para o RH
              </button>
              <span className="text-sm text-neutral-800">
                A declaração para o RH é o próximo passo do projeto e ainda não está pronta.
              </span>
            </div>
          </>
        )}

        {sangria.tipo === 'recente' && (
          <p className="mt-2 text-base">
            No último mês do seu extrato ({sangria.competencia}) você não passou do teto, mas
            passou em algum mês do último ano. Confira mês a mês antes de concluir qualquer
            coisa sobre a sua situação de hoje.
          </p>
        )}

        {sangria.tipo === 'divergente' && (
          <p className="mt-2 text-base">
            Você disse que a nossa leitura de {sangria.competencia} não bate com o seu
            extrato, então não vamos afirmar nada sobre esse mês. Procure o {SINDICATO.nome}{' '}
            com o texto que a conferência gerou.
          </p>
        )}

        {sangria.tipo === 'nenhuma' && (
          <p className="mt-2 text-base">
            Em nenhum mês avaliado a soma dos seus vínculos passou do teto do INSS. Vale
            conferir mês a mês de todo modo: a leitura do extrato é automática e pode falhar.
          </p>
        )}

        {sangria.tipo === 'nadaAvaliado' && (
          <p className="mt-2 text-base">
            Nenhum mês do seu extrato pôde ser avaliado — ou ele não traz competências, ou
            todas estão fora do período que esta calculadora cobre (2021 a 2026). Procure o{' '}
            {SINDICATO.nome}.
          </p>
        )}
      </section>

      {(acumulado.mesesAPedir > 0 || acumulado.mesesPrescritos > 0) && (
        <section
          aria-labelledby="titulo-acumulado"
          className="rounded-lg border border-neutral-400 p-4 sm:p-5"
        >
          <h2 id="titulo-acumulado" className="text-xl font-semibold">
            E você já pagou a mais antes
          </h2>

          <dl className="mt-3 flex flex-col gap-3">
            <div>
              <dt className="text-base">
                Em {acumulado.mesesAPedir}{' '}
                {acumulado.mesesAPedir === 1 ? 'mês ainda no prazo' : 'meses ainda no prazo'}:
              </dt>
              <dd className="text-xl">
                <Dinheiro
                  centavos={acumulado.totalAPedirCentavos}
                  natureza="estimado"
                  elegibilidade="noPrazo"
                />
              </dd>
            </div>

            {acumulado.mesesPrescritos > 0 && (
              <div className="text-neutral-800">
                <dt className="text-sm">
                  Em {acumulado.mesesPrescritos}{' '}
                  {acumulado.mesesPrescritos === 1 ? 'mês já prescrito' : 'meses já prescritos'} —{' '}
                  <strong>fora do pedido</strong>, listados só para conferência:
                </dt>
                <dd className="text-base">
                  <Dinheiro
                    centavos={acumulado.totalPrescritoCentavos}
                    natureza="estimado"
                    elegibilidade="prescrito"
                  />
                </dd>
              </div>
            )}
          </dl>

          {acumulado.mesesUrgentes > 0 && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-base text-amber-950">
              {acumulado.mesesUrgentes === 1
                ? '1 mês prescreve em até 90 dias.'
                : `${acumulado.mesesUrgentes} meses prescrevem em até 90 dias.`}{' '}
              Depois disso esse valor não pode mais ser pedido.
            </p>
          )}

          <p className="mt-3 text-base">
            Esse dinheiro segue um caminho diferente da declaração: é pedido de restituição,
            mês a mês, no PER/DCOMP Web da Receita Federal. Procure o {SINDICATO.nome}
            {SINDICATO.contato ? ` (${SINDICATO.contato})` : ''} antes de abrir o pedido — um
            pedido malfeito é negado e consome o prazo.
          </p>

          <button
            type="button"
            onClick={onConferir}
            className="mt-3 self-start rounded-md bg-neutral-900 px-4 py-2 text-base font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            Ver mês a mês e conferir
          </button>
        </section>
      )}

      {mei && (
        <section
          aria-labelledby="titulo-mei"
          className="rounded-lg border border-neutral-400 p-4 sm:p-5"
        >
          <h2 id="titulo-mei" className="text-lg font-semibold">
            Há também o INSS do seu DAS de MEI
          </h2>
          <p className="mt-2 text-base">
            Em {mei.competencias.length === 1 ? 'um mês' : `${mei.competencias.length} meses`} você
            já atingiu o teto só com os vínculos de empregado. A parte de INSS do DAS pago como
            MEI, de{' '}
            <Dinheiro centavos={mei.valorCentavos} natureza="lido" elegibilidade="naoSeAplica" />,
            foi recolhida sem necessidade.
          </p>
          <p className="mt-2 text-base">
            Esse valor <strong>não está somado</strong> aos números acima porque o caminho é
            outro: pedido pelo Anexo I da IN RFB 2.055/2021, em processo no e-CAC, e não pelo
            PER/DCOMP Web.
          </p>
        </section>
      )}

      <footer className="flex flex-col gap-1 border-t border-neutral-300 pt-4 text-sm text-neutral-800">
        <p>
          Este resultado é uma <strong>estimativa de triagem</strong>, não cálculo oficial nem
          parecer jurídico ou contábil. Confira com o {SINDICATO.nome} antes de levar ao RH ou
          pedir restituição.
        </p>
        <p>
          Seu extrato <strong>não sai do seu navegador</strong>: a leitura e o cálculo
          acontecem no seu próprio dispositivo, sem envio para nenhum servidor.
        </p>
      </footer>
    </div>
  );
}
