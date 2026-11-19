'use client';

import { useRef, useState } from 'react';
import { CnisParseError, parseCnis, type ParseResult } from '@/lib/cnis';
import { calcularTeto, type ResultadoTeto } from '@/lib/teto';
import { dataReferenciaLocal } from '@/lib/apresentacao/data';
import { TelasDoResultado } from './resultado-teto';

type Situacao =
  | { estado: 'inicial' }
  | { estado: 'processando' }
  | { estado: 'pronto'; parse: ParseResult; teto: ResultadoTeto }
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
      const parse = await parseCnis(await arquivo.arrayBuffer());
      // O único `new Date()` do projeto: a biblioteca de cálculo é pura e recebe a data de
      // referência injetada, para que o teste de prescrição seja determinístico.
      const teto = calcularTeto(parse.extrato, dataReferenciaLocal(new Date()));
      setSituacao({ estado: 'pronto', parse, teto });
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Calculadora de Teto Previdenciário</h1>
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-base text-emerald-950">
          Seu arquivo não sai do seu navegador: a leitura do PDF e o cálculo acontecem no seu
          próprio dispositivo, sem envio para nenhum servidor.
        </p>
      </header>

      {situacao.estado !== 'pronto' && (
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
            arrastando ? 'border-emerald-700 bg-emerald-50' : 'border-neutral-600'
          } ${processando ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
        >
          <span className="font-medium">Arraste aqui o PDF do seu extrato CNIS</span>
          <span className="text-base text-neutral-800">
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
      )}

      {situacao.estado === 'processando' && <p role="status">Lendo o extrato…</p>}

      {situacao.estado === 'erro' && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-base text-red-950">
          <strong>Erro:</strong> {situacao.mensagem}
        </p>
      )}

      {situacao.estado === 'pronto' && (
        <TelasDoResultado parse={situacao.parse} teto={situacao.teto} />
      )}
    </div>
  );
}
