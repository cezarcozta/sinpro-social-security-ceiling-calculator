'use client';

import { useRef, useState } from 'react';
import { CnisParseError, parseCnis, type NaturezaVinculo, type ParseResult } from '@/lib/cnis';

type Situacao =
  | { estado: 'inicial' }
  | { estado: 'processando' }
  | { estado: 'pronto'; resultado: ParseResult }
  | { estado: 'erro'; mensagem: string };

export function UploadCnis() {
  const [situacao, setSituacao] = useState<Situacao>({ estado: 'inicial' });
  const [arrastando, setArrastando] = useState(false);

  // Um arquivo por vez: sem isso, duas leituras em paralelo disputam o estado e a última a
  // terminar vence, podendo exibir os dados (nome, CPF, NIT) de um PDF que não é o mais recente.
  const emProcessamento = useRef(false);
  const processando = situacao.estado === 'processando';

  async function processar(arquivo: File) {
    if (emProcessamento.current) return;
    emProcessamento.current = true;
    setSituacao({ estado: 'processando' });
    try {
      const resultado = await parseCnis(await arquivo.arrayBuffer());
      setSituacao({ estado: 'pronto', resultado });
    } catch (erro) {
      setSituacao({
        estado: 'erro',
        mensagem:
          erro instanceof CnisParseError
            ? erro.message
            : 'Não foi possível ler este PDF. Verifique se é o Extrato Previdenciário completo baixado no Meu INSS.',
      });
    } finally {
      emProcessamento.current = false;
    }
  }

  function baixarJson(resultado: ParseResult) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cnis.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Calculadora de Teto Previdenciário</h1>
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Seu arquivo não sai do seu navegador: a leitura do PDF acontece no seu próprio
          dispositivo, sem envio para nenhum servidor.
        </p>
      </header>

      <label
        aria-disabled={processando}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const arquivo = e.dataTransfer.files[0];
          if (arquivo) void processar(arquivo);
        }}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition focus-within:ring-2 focus-within:ring-emerald-700 focus-within:ring-offset-2 ${
          arrastando ? 'border-emerald-600 bg-emerald-50' : 'border-neutral-400'
        } ${processando ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
      >
        <span className="font-medium">Arraste aqui o PDF do seu extrato CNIS</span>
        <span className="text-sm text-neutral-700">
          {processando
            ? 'Aguarde: o extrato atual ainda está sendo lido.'
            : 'ou clique (ou pressione Enter) para escolher o arquivo'}
        </span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            // Permite escolher o mesmo arquivo de novo depois de um erro.
            e.target.value = '';
            if (arquivo) void processar(arquivo);
          }}
        />
      </label>

      {situacao.estado === 'processando' && <p role="status">Lendo o extrato…</p>}

      {situacao.estado === 'erro' && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          <strong>Erro:</strong> {situacao.mensagem}
        </p>
      )}

      {situacao.estado === 'pronto' && (
        <Resultado resultado={situacao.resultado} onBaixar={baixarJson} />
      )}
    </div>
  );
}

/**
 * A natureza vem do layout da tabela, não do tipo de filiado: `TIPOS_NAO_CLT` aceita
 * Trabalhador Avulso, Segurado Especial e Segurado Facultativo, então chamar todo vínculo
 * não-CLT de "contribuinte individual" era falso. Rotular pela natureza diz o que foi lido.
 */
const NATUREZA_LEGIVEL: Record<NaturezaVinculo, string> = {
  CLT: 'remuneração de empregado',
  CI_PRESTADOR: 'prestação de serviço a tomador',
  CI_PROPRIO: 'recolhimento próprio',
};

function Resultado({
  resultado,
  onBaixar,
}: {
  resultado: ParseResult;
  onBaixar: (resultado: ParseResult) => void;
}) {
  const { extrato, warnings } = resultado;
  const competencias = extrato.vinculos.reduce(
    (total, v) => total + (v.natureza === 'CI_PROPRIO' ? v.contribuicoes.length : v.remuneracoes.length),
    0,
  );
  const comIndicadores = extrato.vinculos.filter((v) => (v.indicadores?.length ?? 0) > 0);

  return (
    <section aria-label="Resultado da leitura" role="region" className="flex flex-col gap-4">
      <p role="status" className="text-sm font-medium text-emerald-900">
        Extrato lido com sucesso.
      </p>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Filiado', extrato.filiado.nome ?? '—'],
          ['Vínculos lidos', String(extrato.vinculos.length)],
          ['Vínculos não-CLT', String(extrato.vinculos.filter((v) => v.natureza !== 'CLT').length)],
          ['Competências lidas', String(competencias)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-md border border-neutral-300 p-3">
            <dt className="text-xs uppercase text-neutral-700">{rotulo}</dt>
            <dd className="break-words text-sm font-medium">{valor}</dd>
          </div>
        ))}
      </dl>

      {extrato.vinculos.some((v) => v.natureza !== 'CLT') && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {extrato.vinculos.filter((v) => v.natureza !== 'CLT').length} vínculo(s) lido(s) fora
          da tabela de remuneração de empregado (
          {extrato.vinculos
            .filter((v) => v.natureza !== 'CLT')
            .map((v) => `${v.seq}: ${NATUREZA_LEGIVEL[v.natureza]} — ${v.tipoFiliado}`)
            .join('; ')}
          ). As competências deles também contam para o teto.
        </p>
      )}

      {comIndicadores.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pendências indicadas pelo INSS:{' '}
          {comIndicadores.map((v) => `vínculo ${v.seq}: ${v.indicadores?.join(', ')}`).join('; ')}.
        </p>
      )}

      {warnings.length > 0 && (
        <ul
          role="alert"
          className="flex flex-col gap-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {warnings.map((aviso, i) => (
            <li key={`${aviso.codigo}-${i}`}>
              <strong>Aviso {aviso.codigo}</strong> (pág. {aviso.pagina}
              {aviso.seq !== undefined ? `, vínculo ${aviso.seq}` : ''}): {aviso.detalhe}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onBaixar(resultado)}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        Baixar JSON
      </button>

      <pre
        tabIndex={0}
        aria-label="Dados extraídos em JSON"
        className="max-h-96 overflow-auto rounded-md bg-neutral-900 p-4 text-xs text-neutral-100"
      >
        {JSON.stringify(resultado, null, 2)}
      </pre>
    </section>
  );
}
