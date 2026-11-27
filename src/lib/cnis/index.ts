export { parseCnis, montarExtrato } from './parse-cnis';
export { CnisParseError, TIPO_FILIADO_CLT } from './types';
export { detectarLayout, NOMES_LAYOUT } from './layouts';
export { extrairLegenda } from './legenda';
export type {
  CnisExtrato,
  Contribuicao,
  ErroCode,
  Filiado,
  LegendaIndicador,
  NaturezaVinculo,
  ParseResult,
  ParseWarning,
  Remuneracao,
  Vinculo,
  VinculoContribuinte,
  VinculoRemunerado,
  WarningCode,
} from './types';
