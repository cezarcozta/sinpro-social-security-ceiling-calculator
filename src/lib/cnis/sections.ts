import { textoDaLinha } from './rows';
import type { Filiado, Row } from './types';

export type TipoLinha =
  | 'ignorar'
  | 'filiado'
  | 'gerado-em'
  | 'cabecalho-vinculo'
  | 'rotulo-secao'
  | 'fim'
  | 'dados';

/** Rótulos que se repetem no cabeçalho de toda página e não carregam dado. */
const RUIDO_EXATO = new Set([
  'INSS',
  'CNIS - Cadastro Nacional de Informações Sociais',
  'Extrato Previdenciário',
  'Identificação do Filiado',
  'Relações Previdenciárias',
]);

/** Seções que encerram a varredura de vínculos. */
const FIM = new Set(['Valores Consolidados por Ano Civil', 'Legenda de Indicadores']);

const ROTULOS_SECAO = new Set(['Remunerações', 'Contribuições']);

const PAGINACAO = /^Página \d+ de \d+$/;
const GERADO_EM = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;
const RODAPE = /^(O INSS poderá rever|O segurado somente terá|ou agrupamento, conforme)/;

/** Rótulos que abrem uma linha de dados do filiado. */
const ROTULOS_FILIADO: Record<string, keyof Filiado> = {
  'NIT:': 'nit',
  'CPF:': 'cpf',
  'Nome:': 'nome',
  'Data de nascimento:': 'dataNascimento',
  'Nome da mãe:': 'nomeMae',
};

/** `in` e acesso direto enxergam o protótipo ("constructor"); só chaves próprias são rótulos. */
const ehRotuloFiliado = (str: string): boolean => Object.hasOwn(ROTULOS_FILIADO, str);

export function classificar(linha: Row): TipoLinha {
  const texto = textoDaLinha(linha);
  const primeiro = linha.items[0]?.str ?? '';

  if (RUIDO_EXATO.has(texto) || PAGINACAO.test(texto) || RODAPE.test(texto)) return 'ignorar';
  if (GERADO_EM.test(texto)) return 'gerado-em';
  if (ehRotuloFiliado(primeiro)) return 'filiado';
  if (primeiro === 'Seq.') return 'cabecalho-vinculo';
  if (FIM.has(texto)) return 'fim';
  if (ROTULOS_SECAO.has(texto)) return 'rotulo-secao';
  return 'dados';
}

/**
 * Lê os pares rótulo→valor da linha do filiado. Os rótulos e os valores são
 * itens independentes na mesma linha, em ordem de x, então o valor de cada
 * rótulo é o que vem imediatamente depois dele.
 */
export function extrairCamposFiliado(linha: Row): Partial<Filiado> {
  const campos: Partial<Filiado> = {};
  for (let i = 0; i < linha.items.length; i++) {
    const rotulo = linha.items[i].str;
    const proximo = linha.items[i + 1];
    if (ehRotuloFiliado(rotulo) && proximo && !ehRotuloFiliado(proximo.str)) {
      campos[ROTULOS_FILIADO[rotulo]] = proximo.str;
      i++;
    }
  }
  return campos;
}
