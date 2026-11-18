import { agruparEmLinhas } from './rows';
import { classificar, extrairCamposFiliado } from './sections';
import { celulasPorGrupo, colunasDoCabecalho, mapearColunas, parseValorCentavos, type Coluna } from './table';
import { extrairTextLayer } from './text-layer';
import {
  CnisParseError,
  TIPO_FILIADO_CLT,
  type CnisExtrato,
  type ParseResult,
  type ParseWarning,
  type Row,
  type TextItem,
  type Vinculo,
} from './types';

const COLUNAS_REMUNERACAO = ['Competência', 'Remuneração', 'Indicadores'];
const COMPETENCIA = /^(0[1-9]|1[0-3])\/\d{4}$/;
const PARECE_COMPETENCIA = /\d{2}\/\d{4}/;
const PARECE_VALOR = /\d,\d{2}/;
const MARCA_CNIS = 'CNIS - Cadastro Nacional de Informações Sociais';

/** Rótulo da coluna do vínculo -> campo do objeto Vinculo. */
const CAMPOS_VINCULO: Record<string, keyof Vinculo> = {
  'Seq.': 'seq',
  NIT: 'nit',
  'Código Emp.': 'codigoEmp',
  'Origem do Vínculo': 'origem',
  Trabalhador: 'matricula',
  Vínculo: 'tipoFiliado',
  // Vínculos de outros tipos (ex.: Contribuinte Individual) usam este rótulo, com 7 colunas.
  'Tipo Filiado no Vínculo': 'tipoFiliado',
  'Data Início': 'dataInicio',
  'Data Fim': 'dataFim',
  'Últ. Remun.': 'ultRemun',
  Indicadores: 'indicadores',
};

/**
 * Tipos de filiado RECONHECIDOS. Só estes dois conjuntos têm destino certo: CLT entra em
 * `vinculos`; os não-CLT entram em `ignorados` (exclusão deliberada de produto). Qualquer
 * outra grafia é "não soubemos ler" e vira LAYOUT_DESCONHECIDO, nunca descarte silencioso.
 * Decisão pendente: quais outras variações o CNIS usa de fato (ver report da revisão final).
 */
const TIPOS_CLT: ReadonlySet<string> = new Set([TIPO_FILIADO_CLT]);
const TIPOS_NAO_CLT: ReadonlySet<string> = new Set([
  'Contribuinte Individual',
  'Trabalhador Avulso',
  'Segurado Facultativo',
  'Segurado Especial',
  'Facultativo',
]);

/** A quebra de linha do PDF não pode decidir a classificação: normaliza espaços antes de comparar. */
const normalizarTipo = (tipo: string): string => tipo.replace(/\s+/g, ' ').trim();

type Estado =
  | { nome: 'inicio' }
  | { nome: 'aguardando-valores-vinculo'; colunas: Coluna[] }
  | { nome: 'continuacao-vinculo'; colunas: Coluna[] }
  | { nome: 'aguardando-cabecalho-tabela' }
  | { nome: 'tabela'; colunas: Coluna[] }
  | { nome: 'pulando' }
  | { nome: 'fim' };

export function montarExtrato(itens: TextItem[]): ParseResult {
  if (!itens.some((item) => item.str === MARCA_CNIS)) {
    throw new CnisParseError(
      'NAO_E_CNIS',
      'Este PDF não parece ser um Extrato Previdenciário do CNIS. Baixe o extrato completo no portal Meu INSS.',
    );
  }

  const extrato: CnisExtrato = { filiado: {}, vinculos: [], ignorados: [] };
  const warnings: ParseWarning[] = [];
  let estado: Estado = { nome: 'inicio' };
  let vinculo: Vinculo | null = null;
  // O tipo de filiado pode vir quebrado em duas linhas ("Empregado ou Agente" + "Público"),
  // então o vínculo só é classificado quando a continuação já foi lida.
  let pendente: { vinculo: Vinculo; pagina: number } | null = null;

  const avisar = (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) =>
    warnings.push({ codigo, pagina, seq: vinculo?.seq, detalhe });

  const fecharPendente = () => {
    if (!pendente) return;
    const { vinculo: novo, pagina } = pendente;
    pendente = null;
    const tipoFiliado = normalizarTipo(novo.tipoFiliado);
    novo.tipoFiliado = tipoFiliado;
    if (TIPOS_CLT.has(tipoFiliado)) {
      vinculo = novo;
      extrato.vinculos.push(novo);
    } else if (TIPOS_NAO_CLT.has(tipoFiliado)) {
      extrato.ignorados.push({ seq: novo.seq, tipoFiliado, motivo: 'NAO_CLT' });
    } else {
      warnings.push({
        codigo: 'LAYOUT_DESCONHECIDO',
        pagina,
        seq: novo.seq,
        detalhe: `Tipo de filiado não reconhecido: "${tipoFiliado}". O vínculo ${novo.seq} não foi considerado; confira o extrato.`,
      });
    }
  };

  for (const linha of agruparEmLinhas(itens)) {
    if (estado.nome === 'fim') break;
    const tipo = classificar(linha);

    if (tipo === 'cabecalho-vinculo' || tipo === 'rotulo-secao' || tipo === 'fim') fecharPendente();

    // 'ignorar' não muda estado: é o que permite a tabela continuar na página seguinte.
    if (tipo === 'ignorar') continue;

    if (tipo === 'fim') {
      estado = { nome: 'fim' };
      continue;
    }

    if (tipo === 'gerado-em') {
      extrato.geradoEm ??= linha.items[0].str;
      continue;
    }

    if (tipo === 'filiado') {
      Object.assign(extrato.filiado, extrairCamposFiliado(linha));
      continue;
    }

    if (tipo === 'cabecalho-vinculo') {
      vinculo = null;
      estado = { nome: 'aguardando-valores-vinculo', colunas: colunasDoCabecalho(linha) };
      continue;
    }

    if (tipo === 'rotulo-secao') {
      estado = vinculo ? { nome: 'aguardando-cabecalho-tabela' } : { nome: 'pulando' };
      continue;
    }

    // tipo === 'dados'
    if (estado.nome === 'aguardando-valores-vinculo') {
      const [celulas = {}] = celulasPorGrupo(linha, estado.colunas);
      const novo = construirVinculo(celulas);
      // seq e tipo de filiado são obrigatórios: sem eles não há chave de identificação nem classificação.
      if (novo.tipoFiliado === '' || novo.seq === 0) {
        avisar(
          'LAYOUT_DESCONHECIDO',
          linha.page,
          `Linha de vínculo não reconhecida (seq lido: ${novo.seq || 'nenhum'}, tipo de filiado lido: "${novo.tipoFiliado}"; colunas do cabeçalho: ${estado.colunas.map((c) => c.nome).join(' | ')})`,
        );
        // Não é um não-CLT: é um layout que não soubemos ler. Não classifica nem ignora.
        vinculo = null;
        estado = { nome: 'pulando' };
        continue;
      }
      vinculo = null;
      pendente = { vinculo: novo, pagina: linha.page };
      estado = { nome: 'continuacao-vinculo', colunas: estado.colunas };
      continue;
    }

    if (estado.nome === 'continuacao-vinculo') {
      // "Empregado ou Agente" + "Público" vêm em linhas separadas.
      const [celulas = {}] = celulasPorGrupo(linha, estado.colunas);
      const alvo = pendente?.vinculo;
      const continuacaoTipo = celulas['Vínculo'] ?? celulas['Tipo Filiado no Vínculo'];
      if (alvo && continuacaoTipo) {
        alvo.tipoFiliado = `${alvo.tipoFiliado} ${continuacaoTipo}`.trim();
      }
      if (alvo && linha.items[0]?.str.trim() === 'Indicadores:') {
        acrescentarIndicadores(alvo, linha.items.slice(1).map((i) => i.str).join(' '));
      }
      if (alvo && celulas['Origem do Vínculo']) {
        alvo.origem = `${alvo.origem ?? ''} ${celulas['Origem do Vínculo']}`.trim();
      }
      continue;
    }

    if (estado.nome === 'aguardando-cabecalho-tabela') {
      const colunas = mapearColunas(linha, COLUNAS_REMUNERACAO);
      if (!colunas) {
        avisar('LAYOUT_DESCONHECIDO', linha.page, `Cabeçalho de tabela não reconhecido: "${linha.items.map((i) => i.str).join(' | ')}"`);
        estado = { nome: 'pulando' };
        continue;
      }
      estado = { nome: 'tabela', colunas };
      continue;
    }

    if (estado.nome === 'tabela' && vinculo) {
      lerLinhaDaTabela(linha, estado.colunas, vinculo, avisar);
    }
  }

  fecharPendente();
  return { extrato, warnings };
}

function construirVinculo(celulas: Record<string, string>): Vinculo {
  const vinculo: Vinculo = { seq: 0, tipoFiliado: '', remuneracoes: [] };
  for (const [rotulo, valor] of Object.entries(celulas)) {
    switch (CAMPOS_VINCULO[rotulo]) {
      case 'seq':
        vinculo.seq = Number.parseInt(valor, 10) || 0;
        break;
      case 'nit':
        vinculo.nit = valor;
        break;
      case 'codigoEmp':
        vinculo.codigoEmp = valor;
        break;
      case 'origem':
        vinculo.origem = valor;
        break;
      case 'matricula':
        vinculo.matricula = valor;
        break;
      case 'tipoFiliado':
        vinculo.tipoFiliado = valor;
        break;
      case 'dataInicio':
        vinculo.dataInicio = valor;
        break;
      case 'dataFim':
        vinculo.dataFim = valor;
        break;
      case 'ultRemun':
        vinculo.ultRemun = valor;
        break;
      case 'indicadores':
        acrescentarIndicadores(vinculo, valor);
        break;
      default:
        break;
    }
  }
  return vinculo;
}

function separarIndicadores(texto: string): string[] {
  return texto
    .split(',')
    .map((i) => i.trim())
    .filter((i) => i !== '');
}

/** O campo só passa a existir quando há ao menos um indicador. */
function acrescentarIndicadores(vinculo: Vinculo, texto: string): void {
  const novos = separarIndicadores(texto);
  if (novos.length > 0) vinculo.indicadores = [...(vinculo.indicadores ?? []), ...novos];
}

function lerLinhaDaTabela(
  linha: Row,
  colunas: Coluna[],
  vinculo: Vinculo,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  const grupos = celulasPorGrupo(linha, colunas);
  const comCompetencia = grupos.filter((g) => COMPETENCIA.test(g['Competência'] ?? ''));

  // Grupo sem competência válida: se for fragmento de cabeçalho repetido (nada com cara de dado)
  // pode ser descartado. Se tem algo que PARECE competência ou valor, a célula caiu na coluna
  // errada e o dado não pode evaporar, nem quando os outros grupos da mesma linha estão ok.
  for (const grupo of grupos) {
    if (comCompetencia.includes(grupo)) continue;
    const texto = Object.values(grupo).join(' ');
    if (PARECE_COMPETENCIA.test(texto) || PARECE_VALOR.test(texto)) {
      avisar('CELULA_ORFA', linha.page, `Linha da tabela com dado fora da coluna esperada: "${texto}"`);
    }
  }

  for (const grupo of comCompetencia) {
    const competencia = grupo['Competência'];
    const valorCentavos = parseValorCentavos(grupo['Remuneração'] ?? '');

    if (valorCentavos === null) {
      avisar('CELULA_ORFA', linha.page, `Competência ${competencia} sem remuneração legível (lido: "${grupo['Remuneração'] ?? ''}")`);
      continue;
    }
    if (vinculo.remuneracoes.some((r) => r.competencia === competencia)) {
      avisar('COMPETENCIA_DUPLICADA', linha.page, `Competência ${competencia} aparece mais de uma vez no vínculo`);
    }

    vinculo.remuneracoes.push({ competencia, valorCentavos, indicadores: separarIndicadores(grupo['Indicadores'] ?? '') });
  }
}

export async function parseCnis(
  data: ArrayBuffer,
  opcoes: { workerSrc?: string } = {},
): Promise<ParseResult> {
  return montarExtrato(await extrairTextLayer(data, opcoes));
}
