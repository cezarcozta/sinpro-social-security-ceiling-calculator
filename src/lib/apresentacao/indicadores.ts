import type { CnisExtrato } from '@/lib/cnis';

/**
 * Os indicadores do INSS, agrupados por código e separados entre o que o motor **entendeu
 * e usou** e o que de fato pede conferência.
 *
 * Antes, a tela despejava um aviso só com `competência: código` repetido mês a mês, sob a
 * frase "o INSS marcou pendência". Isso era ilegível e, pior, falso: `IREC-MEI` e
 * `IREC-LC123` não são pendência — são o regime de recolhimento, e `teto/cascata.ts` os lê
 * para derivar a alíquota (5% e 11%). A tela gritava sobre exatamente o dado que o motor
 * consumiu com sucesso.
 *
 * A regra "falhar aberto" da §9 diz o contrário do que a tela fazia: avisar sobre o que
 * **não** entendemos. Daí a classificação por código abaixo, e o código desconhecido
 * caindo em aviso.
 */

export type IndicadorExibivel = {
  codigo: string;
  /** A descrição que o **próprio INSS** deu, lida da legenda do extrato. `''` se não houver. */
  descricao: string;
  /** "01/2022 a 12/2022, 12 meses", "01/2023 e 06/2023" ou "vínculos 2 e 3". */
  onde: string;
  /** Competências distintas marcadas com este código. 0 quando o indicador é do vínculo. */
  meses: number;
  /**
   * `false` = código que esta versão não classifica. Vai para os avisos (falhar aberto) e
   * a tela mostra o código cru junto, para o professor ter o que conferir.
   */
  classificado: boolean;
};

/**
 * Indicadores que descrevem o **regime de recolhimento**, não um problema. Os dois estão
 * aqui porque o motor os consome: `cascata.ts` deriva a alíquota deles. Avisar sobre eles
 * é dizer que há pendência onde há só a forma de contribuir.
 */
const INFORMATIVOS = new Set(['IREC-MEI', 'IREC-LC123']);

/**
 * Indicadores que pedem conferência. Lista explícita, e não "tudo que não é informativo",
 * porque é ela que distingue "conhecemos e é aviso" de "não conhecemos" — e é a segunda
 * que precisa mostrar o código cru.
 */
const AVISOS = new Set([
  'IREC-INDPEND',
  'IREM-INDPEND',
  'PSC-MEN-SM',
  'PSC-MEN-SM-EC103',
  'IREC-LC123-SUP',
  'PREM-EXT',
  'IRE-INSS',
]);

/** `"13/2024"` → 202413. O 13 ordena depois do 12 por ser maior. */
const ordem = (competencia: string): number => {
  const [mes, ano] = competencia.split('/');
  return Number(ano) * 100 + Number(mes);
};

function listar(itens: string[], singular: string, plural: string): string {
  if (itens.length === 1) return `${singular} ${itens[0]}`;
  return `${plural} ${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

/**
 * Três meses ou menos saem nomeados; acima disso vira intervalo com a contagem. Um
 * professor com 20 meses de MEI não lê 20 competências — mas precisa saber quantas são e
 * até quando vão, porque é isso que ele confere no PDF.
 */
function resumirMeses(competencias: string[]): string {
  const ordenadas = [...new Set(competencias)].sort((a, b) => ordem(a) - ordem(b));
  if (ordenadas.length <= 3) return listar(ordenadas, '', '').trim();
  return `${ordenadas[0]} a ${ordenadas.at(-1)}, ${ordenadas.length} meses`;
}

export function indicadoresExibiveis(extrato: CnisExtrato): {
  informativos: IndicadorExibivel[];
  avisos: IndicadorExibivel[];
} {
  const descricoes = new Map(extrato.legenda.map((l) => [l.codigo, l.descricao]));
  const competenciasPorCodigo = new Map<string, string[]>();
  const vinculosPorCodigo = new Map<string, number[]>();

  const anotar = (mapa: Map<string, (string | number)[]>, codigo: string, onde: string | number) => {
    const lista = mapa.get(codigo);
    if (lista) lista.push(onde);
    else mapa.set(codigo, [onde]);
  };

  for (const v of extrato.vinculos) {
    for (const codigo of v.indicadores ?? []) {
      anotar(vinculosPorCodigo as Map<string, (string | number)[]>, codigo, v.seq);
    }
    const linhas = v.natureza === 'CI_PROPRIO' ? v.contribuicoes : v.remuneracoes;
    for (const linha of linhas) {
      for (const codigo of linha.indicadores) {
        anotar(competenciasPorCodigo as Map<string, (string | number)[]>, codigo, linha.competencia);
      }
    }
  }

  const informativos: IndicadorExibivel[] = [];
  const avisos: IndicadorExibivel[] = [];

  for (const codigo of new Set([...competenciasPorCodigo.keys(), ...vinculosPorCodigo.keys()])) {
    const competencias = competenciasPorCodigo.get(codigo) ?? [];
    const seqs = [...new Set(vinculosPorCodigo.get(codigo) ?? [])].sort((a, b) => a - b);

    // Competência antes de vínculo: é onde o dinheiro está, e é o que o professor acha no
    // PDF. O nível de vínculo só aparece sozinho quando não há competência marcada.
    const onde =
      competencias.length > 0
        ? resumirMeses(competencias)
        : listar(seqs.map(String), 'vínculo', 'vínculos');

    const item: IndicadorExibivel = {
      codigo,
      descricao: descricoes.get(codigo) ?? '',
      onde,
      meses: new Set(competencias).size,
      classificado: INFORMATIVOS.has(codigo) || AVISOS.has(codigo),
    };

    if (INFORMATIVOS.has(codigo)) informativos.push(item);
    else avisos.push(item);
  }

  const porCodigo = (a: IndicadorExibivel, b: IndicadorExibivel) => a.codigo.localeCompare(b.codigo);
  return { informativos: informativos.sort(porCodigo), avisos: avisos.sort(porCodigo) };
}
