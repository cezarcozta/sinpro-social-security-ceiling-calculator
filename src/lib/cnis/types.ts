/** Item de texto do PDF, já normalizado para coordenadas de leitura. */
export type TextItem = { page: number; x: number; y: number; str: string };

/** Itens que compartilham a mesma linha visual, ordenados por x. */
export type Row = { page: number; y: number; items: TextItem[] };

/** Linha das tabelas CLT e de prestador de serviço: só a remuneração. */
export type Remuneracao = {
  /** "MM/AAAA"; MM pode ser 13 (gratificação natalina). */
  competencia: string;
  valorCentavos: number;
  indicadores: string[];
};

/**
 * Linha da tabela de recolhimento próprio. Traz DUAS cifras, e a primeira é o valor
 * efetivamente pago — diferente de CLT e prestador, onde só há a remuneração e o desconto
 * tem que ser estimado.
 */
export type Contribuicao = {
  competencia: string;
  dataPgto?: string;
  contribuicaoCentavos: number;
  salarioContribuicaoCentavos: number;
  indicadores: string[];
};

type VinculoBase = {
  seq: number;
  nit?: string;
  /** Pode ser CNPJ ("12.345.678/0001-95") ou código CEI/CNO ("98.765.432"). String opaca. */
  codigoEmp?: string;
  origem?: string;
  matricula?: string;
  tipoFiliado: string;
  dataInicio?: string;
  dataFim?: string;
  ultRemun?: string;
  /** Indicadores de nível de vínculo (ex.: "IREM-INDPEND"). Ausente quando não há. */
  indicadores?: string[];
};

export type VinculoRemunerado = VinculoBase & {
  natureza: 'CLT' | 'CI_PRESTADOR';
  remuneracoes: Remuneracao[];
};

export type VinculoContribuinte = VinculoBase & {
  natureza: 'CI_PROPRIO';
  contribuicoes: Contribuicao[];
};

/** União discriminada por `natureza`: a F2 percorre as camadas com switch exaustivo. */
export type Vinculo = VinculoRemunerado | VinculoContribuinte;

export type Filiado = {
  nome?: string;
  nit?: string;
  cpf?: string;
  dataNascimento?: string;
  nomeMae?: string;
};

export type CnisExtrato = {
  filiado: Filiado;
  geradoEm?: string;
  vinculos: Vinculo[];
};

export type WarningCode =
  | 'LAYOUT_DESCONHECIDO'
  | 'CELULA_ORFA'
  | 'COMPETENCIA_DUPLICADA'
  /** Vínculo sem tabela de competências: a natureza foi inferida do tipo de filiado. */
  | 'NATUREZA_INDEFINIDA'
  /** O layout da tabela e o tipo de filiado discordam. O layout vence; o aviso registra. */
  | 'NATUREZA_DIVERGENTE';

export type ParseWarning = {
  codigo: WarningCode;
  pagina: number;
  seq?: number;
  detalhe: string;
};

export type ParseResult = { extrato: CnisExtrato; warnings: ParseWarning[] };

export type ErroCode = 'NAO_E_CNIS' | 'SEM_CAMADA_DE_TEXTO' | 'PDF_PROTEGIDO';

export class CnisParseError extends Error {
  constructor(
    public readonly codigo: ErroCode,
    message: string,
  ) {
    super(message);
    this.name = 'CnisParseError';
  }
}

/** Marca o vínculo como CLT (empregado), único tipo considerado em F1. */
export const TIPO_FILIADO_CLT = 'Empregado ou Agente Público';

/**
 * A natureza do vínculo é decidida pelo LAYOUT DA TABELA, não pelo `Tipo Filiado no
 * Vínculo`: "Contribuinte Individual" aparece tanto em recolhimento próprio quanto em
 * prestação de serviço, e os dois têm colunas diferentes. O tipo de filiado serve de
 * conferência, nunca de fonte da verdade.
 */
export type NaturezaVinculo = 'CLT' | 'CI_PRESTADOR' | 'CI_PROPRIO';
