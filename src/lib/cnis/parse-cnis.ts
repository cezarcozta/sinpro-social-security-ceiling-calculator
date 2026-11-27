import { agruparEmLinhas } from './rows';
import { extrairLegenda } from './legenda';
import { classificar, extrairCamposFiliado } from './sections';
import { detectarLayout, type LayoutDetectado } from './layouts';
import {
  celulasPorGrupo,
  celulasPorGrupoIndexado,
  colunasDoCabecalho,
  parseValorCentavos,
  type Coluna,
} from './table';
import { extrairTextLayer } from './text-layer';
import {
  CnisParseError,
  TIPO_FILIADO_CLT,
  type CnisExtrato,
  type Contribuicao,
  type NaturezaVinculo,
  type ParseResult,
  type ParseWarning,
  type Remuneracao,
  type Row,
  type TextItem,
  type Vinculo,
} from './types';

const COMPETENCIA = /^(0[1-9]|1[0-3])\/\d{4}$/;
const PARECE_COMPETENCIA = /\d{2}\/\d{4}/;
const PARECE_VALOR = /\d,\d{2}/;
/** Célula que tem só códigos de indicador, como "PSC-MEN-SM-EC103," ou "IREC-LC123, IREC-MEI". */
const SO_INDICADORES = /^[A-Z][A-Z0-9-]*(,\s*[A-Z][A-Z0-9-]*)*,?$/;
const MARCA_CNIS = 'CNIS - Cadastro Nacional de Informações Sociais';

/** Rótulo da coluna do vínculo -> campo do objeto Vinculo. */
const CAMPOS_VINCULO: Record<string, keyof EmConstrucao> = {
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

const TIPOS_CLT: ReadonlySet<string> = new Set([TIPO_FILIADO_CLT]);
/** Grafias de tipo de filiado que o CNIS usa fora do RGPS-empregado. Só conferência. */
const TIPOS_NAO_CLT: ReadonlySet<string> = new Set([
  'Contribuinte Individual',
  'Trabalhador Avulso',
  'Segurado Facultativo',
  'Segurado Especial',
  'Facultativo',
]);

/**
 * A natureza só é conhecida no cabeçalho da TABELA, que vem depois da linha do vínculo.
 * Então o vínculo é construído mutável, com as duas listas, e finalizado na união no fim
 * da varredura.
 */
type EmConstrucao = {
  seq: number;
  nit?: string;
  codigoEmp?: string;
  origem?: string;
  matricula?: string;
  tipoFiliado: string;
  dataInicio?: string;
  dataFim?: string;
  ultRemun?: string;
  indicadores?: string[];
  natureza: NaturezaVinculo | null;
  pagina: number;
  remuneracoes: Remuneracao[];
  contribuicoes: Contribuicao[];
  /**
   * Último registro lido de cada grupo de colunas. Serve para costurar célula de
   * indicadores que o PDF quebrou em duas linhas visuais: a continuação chega numa linha
   * sem competência e tem que voltar para a competência do SEU grupo, não da última lida.
   */
  ultimoPorGrupo: Array<Remuneracao | Contribuicao | undefined>;
  /** Colunas da última tabela aberta, para a continuação que não repete o cabeçalho. */
  colunas?: Coluna[];
};

/** Fallback quando o vínculo não tem tabela: o tipo de filiado é o que resta. */
const naturezaPeloTipo = (tipoFiliado: string): NaturezaVinculo =>
  TIPOS_CLT.has(tipoFiliado) ? 'CLT' : 'CI_PROPRIO';

function finalizar(v: EmConstrucao): Vinculo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { natureza, remuneracoes, contribuicoes, ultimoPorGrupo: _ultimo, ...resto } = v;
  // `pagina` só serve ao aviso NATUREZA_INDEFINIDA; não faz parte do Vinculo público.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pagina: _pagina, ...base } = resto;
  const definida = natureza ?? naturezaPeloTipo(v.tipoFiliado);
  return definida === 'CI_PROPRIO'
    ? { ...base, natureza: 'CI_PROPRIO', contribuicoes }
    : { ...base, natureza: definida, remuneracoes };
}

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

  const linhas = agruparEmLinhas(itens);
  // A legenda é lida numa passada própria: ela vive depois do fim da varredura de
  // vínculos, e não tem nada a ver com a máquina de estados que lê as tabelas.
  const extrato: CnisExtrato = { filiado: {}, vinculos: [], legenda: extrairLegenda(linhas) };
  const construindo: EmConstrucao[] = [];
  const warnings: ParseWarning[] = [];
  let estado: Estado = { nome: 'inicio' };
  // `as`: o TS não enxerga as atribuições feitas dentro do closure `fecharPendente`.
  let vinculo = null as EmConstrucao | null;
  // O tipo de filiado pode vir quebrado em duas linhas ("Empregado ou Agente" + "Público"),
  // então o vínculo só é classificado quando a continuação já foi lida.
  let pendente: { vinculo: EmConstrucao; pagina: number } | null = null;

  const avisar = (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) =>
    warnings.push({ codigo, pagina, seq: vinculo?.seq, detalhe });

  // Competências vistas enquanto o parser pulava um bloco que não soube ler. Viram um
  // aviso só, com o tamanho do prejuízo, em vez de um aviso por linha ou de silêncio.
  let puladas: string[] = [];
  let paginaPulada = 0;

  const fecharPuladas = () => {
    if (puladas.length === 0) return;
    warnings.push({
      codigo: 'BLOCO_PULADO',
      pagina: paginaPulada,
      detalhe: `${puladas.length} competência(s) ficaram de fora do bloco que não pôde ser lido: ${puladas.join(', ')}`,
    });
    puladas = [];
  };

  const fecharPendente = () => {
    if (!pendente) return;
    const { vinculo: novo, pagina } = pendente;
    pendente = null;
    const tipoFiliado = normalizarTipo(novo.tipoFiliado);
    novo.tipoFiliado = tipoFiliado;
    if (TIPOS_CLT.has(tipoFiliado) || TIPOS_NAO_CLT.has(tipoFiliado)) {
      vinculo = novo;
      construindo.push(novo);
    } else {
      warnings.push({
        codigo: 'LAYOUT_DESCONHECIDO',
        pagina,
        seq: novo.seq,
        detalhe: `Tipo de filiado não reconhecido: "${tipoFiliado}". O vínculo ${novo.seq} não foi considerado; confira o extrato.`,
      });
    }
  };

  for (const linha of linhas) {
    if (estado.nome === 'fim') break;
    const tipo = classificar(linha);

    if (tipo === 'cabecalho-vinculo' || tipo === 'rotulo-secao' || tipo === 'fim') {
      fecharPendente();
      fecharPuladas();
    }

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
      const novo = construirVinculo(celulas, linha.page);
      // seq e tipo de filiado são obrigatórios: sem eles não há chave de identificação nem classificação.
      if (novo.tipoFiliado === '' || novo.seq === 0) {
        // `avisar` leria o seq do vínculo corrente, que acabou de ser anulado: o seq que
        // interessa é o desta linha, e o texto dela diz se era dado de tabela mal lido.
        warnings.push({
          codigo: 'LAYOUT_DESCONHECIDO',
          pagina: linha.page,
          seq: novo.seq || undefined,
          detalhe: `Linha de vínculo não reconhecida (seq lido: ${novo.seq || 'nenhum'}, tipo de filiado lido: "${novo.tipoFiliado}"; linha: "${linha.items.map((i) => i.str).join(' | ')}"; colunas do cabeçalho: ${estado.colunas.map((c) => c.nome).join(' | ')})`,
        });
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
      // O rótulo da seção pode ter vindo partido pelo PDF ("Remuneraç" + "ões"), e então
      // não foi reconhecido. O cabeçalho de colunas abre a tabela do mesmo jeito: sem isto
      // a tabela inteira era engolida como continuação do vínculo.
      const detectado = detectarLayout(linha);
      if (detectado) {
        fecharPendente();
        if (vinculo) abrirTabela(vinculo, detectado, linha.page, avisar);
        estado = { nome: 'tabela', colunas: detectado.colunas };
        continue;
      }
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
      const detectado = detectarLayout(linha);
      if (!detectado) {
        const texto = linha.items.map((i) => i.str).join(' | ');
        // Continuação de página que repete o rótulo da seção mas não o cabeçalho de
        // colunas: esta linha já é dado. As colunas da tabela anterior do mesmo vínculo
        // valem, porque a geometria da página não muda — melhor que perder as competências.
        if (vinculo?.colunas && (PARECE_COMPETENCIA.test(texto) || PARECE_VALOR.test(texto))) {
          avisar(
            'CABECALHO_REAPROVEITADO',
            linha.page,
            `Tabela continuou sem repetir o cabeçalho de colunas; usando as colunas da tabela anterior do vínculo ${vinculo.seq}`,
          );
          estado = { nome: 'tabela', colunas: vinculo.colunas };
          lerLinhaDaTabela(linha, estado.colunas, vinculo, avisar);
          continue;
        }
        avisar('LAYOUT_DESCONHECIDO', linha.page, `Cabeçalho de tabela não reconhecido: "${texto}"`);
        estado = { nome: 'pulando' };
        continue;
      }
      if (vinculo) abrirTabela(vinculo, detectado, linha.page, avisar);
      estado = { nome: 'tabela', colunas: detectado.colunas };
      continue;
    }

    if (estado.nome === 'tabela' && vinculo) {
      lerLinhaDaTabela(linha, estado.colunas, vinculo, avisar);
    }

    if (estado.nome === 'pulando') {
      for (const item of linha.items) {
        if (COMPETENCIA.test(item.str)) puladas.push(item.str);
      }
      paginaPulada = linha.page;
    }
  }

  fecharPendente();
  fecharPuladas();
  for (const v of construindo) {
    if (v.natureza === null) {
      warnings.push({
        codigo: 'NATUREZA_INDEFINIDA',
        pagina: v.pagina,
        seq: v.seq,
        detalhe: `Vínculo ${v.seq} ("${v.tipoFiliado}") não tem tabela de competências; natureza inferida do tipo de filiado.`,
      });
    }
  }
  extrato.vinculos = construindo.map(finalizar);
  return { extrato, warnings };
}

function construirVinculo(celulas: Record<string, string>, pagina: number): EmConstrucao {
  const vinculo: EmConstrucao = {
    seq: 0,
    tipoFiliado: '',
    natureza: null,
    pagina,
    remuneracoes: [],
    contribuicoes: [],
    ultimoPorGrupo: [],
  };
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
    // O PDF pode cortar o código no hífen ("PSC-MEN-SM-" + "EC103"); dentro da mesma célula
    // as metades chegam separadas por espaço, e código de indicador não tem espaço.
    .replace(/-\s+/g, '-')
    .split(',')
    .map((i) => i.trim())
    .filter((i) => i !== '');
}

/** O campo só passa a existir quando há ao menos um indicador. */
function acrescentarIndicadores(vinculo: EmConstrucao, texto: string): void {
  const novos = separarIndicadores(texto);
  if (novos.length > 0) vinculo.indicadores = [...(vinculo.indicadores ?? []), ...novos];
}

/**
 * Um vínculo tem uma natureza só, então a lista da tabela anterior não entra no resultado
 * quando a segunda tabela tem outro layout. O dado some do extrato, mas não do aviso.
 */
function avisarTabelaDescartada(
  vinculo: EmConstrucao,
  nova: NaturezaVinculo,
  pagina: number,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  const anterior = vinculo.natureza;
  if (anterior === null || anterior === nova) return;
  const descartadas = anterior === 'CI_PROPRIO' ? vinculo.contribuicoes : vinculo.remuneracoes;
  if (descartadas.length === 0) return;
  avisar(
    'TABELA_DESCARTADA',
    pagina,
    `Vínculo ${vinculo.seq} tem tabela ${anterior} e tabela ${nova}. As competências lidas na primeira não entram no resultado: ${descartadas.map((d) => d.competencia).join(', ')}`,
  );
}

/**
 * Põe o vínculo em leitura da tabela detectada: fixa a natureza, guarda as colunas para
 * uma eventual continuação sem cabeçalho e reinicia a costura de indicadores, que não
 * atravessa cabeçalho de tabela.
 */
function abrirTabela(
  vinculo: EmConstrucao,
  detectado: LayoutDetectado,
  pagina: number,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  avisarTabelaDescartada(vinculo, detectado.natureza, pagina, avisar);
  vinculo.natureza = detectado.natureza;
  vinculo.colunas = detectado.colunas;
  vinculo.ultimoPorGrupo = [];
  const ehCLT = TIPOS_CLT.has(vinculo.tipoFiliado);
  if (ehCLT !== (detectado.natureza === 'CLT')) {
    avisar(
      'NATUREZA_DIVERGENTE',
      pagina,
      `Layout de tabela ${detectado.natureza} com tipo de filiado "${vinculo.tipoFiliado}". O layout prevalece.`,
    );
  }
}

/**
 * Grupos da linha que têm competência válida, com o número do grupo. Os demais são
 * conferidos: continuação de célula de indicadores volta para a competência do mesmo
 * grupo, fragmento de cabeçalho repetido pode ser descartado, mas célula com cara de
 * dado fora da coluna esperada não pode evaporar.
 */
function gruposComDado(
  linha: Row,
  colunas: Coluna[],
  vinculo: EmConstrucao,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): Array<{ grupo: number; celulas: Record<string, string> }> {
  const grupos = celulasPorGrupoIndexado(linha, colunas);
  const comCompetencia = grupos.filter((g) => COMPETENCIA.test(g.celulas['Competência'] ?? ''));
  for (const { grupo, celulas } of grupos) {
    if (comCompetencia.some((g) => g.celulas === celulas)) continue;
    const texto = Object.values(celulas).join(' ');
    const indicadores = (celulas['Indicadores'] ?? '').trim();
    const soNaColunaDeIndicadores = Object.entries(celulas).every(
      ([nome, valor]) => nome === 'Indicadores' || valor.trim() === '',
    );
    const ultimo = vinculo.ultimoPorGrupo[grupo];
    if (indicadores !== '' && soNaColunaDeIndicadores && SO_INDICADORES.test(indicadores) && ultimo) {
      const partes = separarIndicadores(indicadores);
      const anterior = ultimo.indicadores.at(-1);
      // Corte no hífen entre as duas linhas: "PSC-MEN-SM-" fechou a linha de cima e
      // "EC103" abre esta. É um código só, não dois.
      if (anterior?.endsWith('-') && partes.length > 0) {
        ultimo.indicadores[ultimo.indicadores.length - 1] = `${anterior}${partes.shift()}`;
      }
      ultimo.indicadores.push(...partes);
      continue;
    }
    if (PARECE_COMPETENCIA.test(texto) || PARECE_VALOR.test(texto)) {
      avisar('CELULA_ORFA', linha.page, `Linha da tabela com dado fora da coluna esperada: "${texto}"`);
    }
  }
  return comCompetencia;
}

/** Despacha a linha para o leitor do layout que a natureza do vínculo determina. */
function lerLinhaDaTabela(
  linha: Row,
  colunas: Coluna[],
  vinculo: EmConstrucao,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  if (vinculo.natureza === 'CI_PROPRIO') {
    lerLinhaContribuicao(linha, colunas, vinculo, avisar);
  } else {
    lerLinhaRemuneracao(linha, colunas, vinculo, avisar);
  }
}

/** CLT e CI_PRESTADOR: uma cifra só, na coluna "Remuneração". */
function lerLinhaRemuneracao(
  linha: Row,
  colunas: Coluna[],
  vinculo: EmConstrucao,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  for (const { grupo: numeroDoGrupo, celulas: grupo } of gruposComDado(linha, colunas, vinculo, avisar)) {
    const competencia = grupo['Competência'];
    const valorCentavos = parseValorCentavos(grupo['Remuneração'] ?? '');

    if (valorCentavos === null) {
      avisar('CELULA_ORFA', linha.page, `Competência ${competencia} sem remuneração legível (lido: "${grupo['Remuneração'] ?? ''}")`);
      continue;
    }
    if (vinculo.remuneracoes.some((r) => r.competencia === competencia)) {
      avisar('COMPETENCIA_DUPLICADA', linha.page, `Competência ${competencia} aparece mais de uma vez no vínculo`);
    }

    const remuneracao: Remuneracao = {
      competencia,
      valorCentavos,
      indicadores: separarIndicadores(grupo['Indicadores'] ?? ''),
    };
    vinculo.remuneracoes.push(remuneracao);
    vinculo.ultimoPorGrupo[numeroDoGrupo] = remuneracao;
  }
}

/** CI_PROPRIO: duas cifras por linha. `Contribuição` é o valor PAGO, não uma estimativa. */
function lerLinhaContribuicao(
  linha: Row,
  colunas: Coluna[],
  vinculo: EmConstrucao,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  for (const { grupo: numeroDoGrupo, celulas: grupo } of gruposComDado(linha, colunas, vinculo, avisar)) {
    const competencia = grupo['Competência'];
    const contribuicaoCentavos = parseValorCentavos(grupo['Contribuição'] ?? '');
    const salarioContribuicaoCentavos = parseValorCentavos(grupo['Salário Contribuição'] ?? '');

    // As duas cifras são obrigatórias: sem a base não há como conferir a alíquota, e sem o
    // valor pago não há o que restituir. Faltando uma, o dado não entra meio lido.
    if (contribuicaoCentavos === null || salarioContribuicaoCentavos === null) {
      avisar(
        'CELULA_ORFA',
        linha.page,
        `Competência ${competencia} sem as duas cifras legíveis (contribuição: "${grupo['Contribuição'] ?? ''}", salário de contribuição: "${grupo['Salário Contribuição'] ?? ''}")`,
      );
      continue;
    }
    if (vinculo.contribuicoes.some((c) => c.competencia === competencia)) {
      avisar('COMPETENCIA_DUPLICADA', linha.page, `Competência ${competencia} aparece mais de uma vez no vínculo`);
    }

    const contribuicao: Contribuicao = {
      competencia,
      contribuicaoCentavos,
      salarioContribuicaoCentavos,
      indicadores: separarIndicadores(grupo['Indicadores'] ?? ''),
    };
    const dataPgto = (grupo['Data Pgto.'] ?? '').trim();
    if (dataPgto !== '') contribuicao.dataPgto = dataPgto;

    vinculo.contribuicoes.push(contribuicao);
    vinculo.ultimoPorGrupo[numeroDoGrupo] = contribuicao;
  }
}

export async function parseCnis(
  data: ArrayBuffer,
  opcoes: { workerSrc?: string } = {},
): Promise<ParseResult> {
  return montarExtrato(await extrairTextLayer(data, opcoes));
}
