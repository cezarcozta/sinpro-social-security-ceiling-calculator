import { useState, type ReactNode } from 'react';
import type { CnisExtrato } from '@/lib/cnis';
import type { ResultadoCompetencia, ResultadoTeto } from '@/lib/teto';
import { agruparPorAno } from '@/lib/apresentacao/anos';
import { textoDivergencia } from '@/lib/apresentacao/divergencia';
import { fontesPorCompetencia, type FontePagadora } from '@/lib/apresentacao/fontes';
import { SINDICATO } from '@/lib/apresentacao/sindicato';
import type { Marca, Marcas } from '@/lib/apresentacao/veredito';
import { Dinheiro } from './dinheiro';

/**
 * A tela de conferência: mês a mês, contra o PDF.
 *
 * Esta tela existe porque a leitura do extrato é automática e pode falhar sem avisar. Ela
 * tem duas funções:
 *
 * 1. deixar o professor verificar o que lemos antes de levar qualquer número ao RH ou à
 *    Receita — a §9 da spec da F2 chama isso de "nunca um número sozinho";
 * 2. ser o portão da F4: a carta ao RH só deve sair de um mês conferido.
 *
 * O detalhe por **empregador** não vem do motor (`camadas` é por natureza), e sim de
 * `fontesPorCompetencia`, derivado do extrato — é o que o professor consegue comparar com o
 * PDF dele. Um teste exige que a soma das fontes seja igual à base que o motor usou.
 */

/** `"2026-03-20"` → `"20/03/2026"`, que é como o professor lê data. */
function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function Fonte({ fonte }: { fonte: FontePagadora }): ReactNode {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="break-all text-sm text-neutral-800">{fonte.rotulo}</span>
      <Dinheiro
        centavos={fonte.valorCentavos}
        natureza={fonte.lido ? 'lido' : 'estimado'}
        elegibilidade="naoSeAplica"
      />
    </li>
  );
}

function LinhaMes({
  mes,
  fontes,
  marca,
  onMarcar,
}: {
  mes: ResultadoCompetencia;
  fontes: FontePagadora[];
  marca: Marca | undefined;
  onMarcar: (competencia: string, marca: Marca) => void;
}): ReactNode {
  const { competencia, prescricao } = mes;

  return (
    <fieldset className="border-t border-neutral-300 px-1 py-3">
      <legend className="px-1 font-medium">Competência {competencia}</legend>

      <div className="flex flex-col gap-2">
        {mes.decimoTerceiro && (
          <p className="text-sm text-neutral-800">
            13º salário: tem <strong>teto próprio</strong>, calculado em separado do salário de
            dezembro.
          </p>
        )}

        <dl className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-sm text-neutral-800">Soma do mês</dt>
            <dd>
              <Dinheiro
                centavos={mes.somaBaseCentavos}
                natureza="exato"
                elegibilidade="naoSeAplica"
              />
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-sm text-neutral-800">Teto vigente</dt>
            <dd>
              <Dinheiro centavos={mes.tetoCentavos} natureza="exato" elegibilidade="naoSeAplica" />
            </dd>
          </div>
          {mes.excedeuTeto && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className="text-sm text-neutral-800">Acima do teto</dt>
                <dd>
                  <Dinheiro
                    centavos={mes.baseExcedenteCentavos}
                    natureza="exato"
                    elegibilidade="naoSeAplica"
                  />
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className="text-sm text-neutral-800">Pago a mais</dt>
                <dd>
                  <Dinheiro
                    centavos={mes.retidoAMaiorCentavos}
                    natureza="estimado"
                    elegibilidade={prescricao.noPrazo ? 'noPrazo' : 'prescrito'}
                  />
                </dd>
              </div>
            </>
          )}
        </dl>

        {fontes.length > 0 && (
          <div>
            <p className="text-sm text-neutral-800">
              {fontes.length === 1 ? 'Fonte pagadora:' : 'Fontes pagadoras:'}
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {fontes.map((fonte, i) => (
                <Fonte key={`${fonte.rotulo}-${i}`} fonte={fonte} />
              ))}
            </ul>
          </div>
        )}

        {!prescricao.noPrazo && (
          <p className="text-sm text-neutral-800">
            O prazo de cinco anos deste mês venceu em {dataBr(prescricao.prescreveEm)}:{' '}
            <strong>fora do pedido</strong>. Fica listado só para conferência.
          </p>
        )}

        {prescricao.noPrazo && prescricao.urgente && (
          <p className="rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-950">
            Atenção ao prazo: este mês prescreve em {dataBr(prescricao.prescreveEm)}, em menos de
            90 dias ({prescricao.diasRestantes} dias).
          </p>
        )}

        <div className="no-print flex flex-wrap gap-x-5 gap-y-1 pt-1">
          <label className="flex items-center gap-2 text-base">
            <input
              type="radio"
              name={`confere-${competencia}`}
              checked={marca === 'bate'}
              onChange={() => onMarcar(competencia, 'bate')}
            />
            Bate com meu PDF
          </label>
          <label className="flex items-center gap-2 text-base">
            <input
              type="radio"
              name={`confere-${competencia}`}
              checked={marca === 'naoBate'}
              onChange={() => onMarcar(competencia, 'naoBate')}
            />
            Não bate
          </label>
        </div>

        {marca === 'naoBate' && (
          <div className="no-print flex flex-col gap-1 rounded-md bg-neutral-100 p-3">
            <label htmlFor={`divergencia-${competencia}`} className="text-sm font-medium">
              Texto para enviar ao sindicato
            </label>
            <p className="text-sm text-neutral-800">
              Copie e envie ao {SINDICATO.nome}
              {SINDICATO.contato ? ` (${SINDICATO.contato})` : ''}. Nada é enviado
              automaticamente: só sai do seu dispositivo se você mesmo mandar.
            </p>
            <textarea
              id={`divergencia-${competencia}`}
              readOnly
              rows={10}
              className="w-full rounded-md border border-neutral-400 bg-white p-2 font-mono text-sm"
              value={textoDivergencia(mes, fontes)}
            />
          </div>
        )}
      </div>
    </fieldset>
  );
}

export function Conferencia({
  teto,
  extrato,
  marcas,
  onMarcar,
  onVoltar,
}: {
  teto: ResultadoTeto;
  extrato: CnisExtrato;
  marcas: Marcas;
  onMarcar: (competencia: string, marca: Marca) => void;
  onVoltar: () => void;
}): ReactNode {
  const anos = agruparPorAno(teto);
  const fontes = fontesPorCompetencia(extrato);
  const anoMaisRecente = anos[0]?.ano;

  // Abrir tudo serve a duas coisas: conferir vários anos seguidos sem clicar em cada um, e
  // imprimir. Forçar `<details>` aberto só pela folha de impressão não é confiável entre
  // navegadores, então o controle é explícito.
  const [todosAbertos, setTodosAbertos] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Confira mês a mês</h2>
        <p className="text-base">
          Compare cada mês com o PDF do seu extrato antes de usar qualquer número. Se algum mês
          não bater, diga aqui: ele sai do total a pedir e você recebe um texto para mandar ao{' '}
          {SINDICATO.nome}.
        </p>
      </header>

      {anos.length > 1 && (
        <button
          type="button"
          onClick={() => setTodosAbertos((aberto) => !aberto)}
          className="no-print self-start rounded-md border border-neutral-500 px-3 py-1 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          {todosAbertos ? 'Fechar os anos' : 'Abrir todos os anos (para conferir ou imprimir)'}
        </button>
      )}

      {anos.map((grupo) => (
        <details
          key={grupo.ano}
          aria-label={`Ano ${grupo.ano}`}
          open={todosAbertos || grupo.ano === anoMaisRecente}
          className="rounded-lg border border-neutral-400 px-3 py-2"
        >
          <summary className="cursor-pointer py-1 text-base font-semibold">
            {grupo.ano}
            <span className="ml-2 font-normal text-neutral-800">
              {grupo.meses.length === 1 ? '1 mês lido' : `${grupo.meses.length} meses lidos`},{' '}
              {grupo.mesesAcimaDoTeto === 0
                ? 'nenhum acima do teto'
                : grupo.mesesAcimaDoTeto === 1
                  ? '1 acima do teto'
                  : `${grupo.mesesAcimaDoTeto} acima do teto`}
              {grupo.temUrgente ? ' · tem mês prescrevendo' : ''}
            </span>
          </summary>

          {grupo.meses.map((mes) => (
            <LinhaMes
              key={mes.competencia}
              mes={mes}
              fontes={fontes.get(mes.competencia) ?? []}
              marca={marcas[mes.competencia]}
              onMarcar={onMarcar}
            />
          ))}
        </details>
      ))}

      {teto.ignoradasSemTabela.length > 0 && (
        <section className="rounded-lg border border-neutral-400 p-3">
          <h3 className="font-medium">Meses não avaliados</h3>
          <p className="mt-1 text-sm text-neutral-800">
            Estas competências <strong>não foram avaliadas</strong> por estarem fora do período
            coberto por esta calculadora (2021 a 2026):
          </p>
          <p className="mt-1 text-sm">{teto.ignoradasSemTabela.join(', ')}</p>
        </section>
      )}

      <button
        type="button"
        onClick={onVoltar}
        className="no-print self-start rounded-md border border-neutral-500 px-4 py-2 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        Voltar ao resumo
      </button>
    </div>
  );
}
