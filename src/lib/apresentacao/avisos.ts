import type { ParseResult, WarningCode } from '@/lib/cnis';
import { VIGENCIAS, type CodigoAvisoTeto, type ResultadoTeto } from '@/lib/teto';
import { indicadoresExibiveis } from './indicadores';

/**
 * Avisos das três camadas (parser, motor, indicadores do próprio INSS) traduzidos para
 * português e reunidos numa lista só.
 *
 * Duas regras da §9 da spec da F2 vivem aqui:
 *
 * - **Falhar aberto.** Nada é suprimido para a tela ficar limpa, e código que não
 *   conhecemos sai com frase genérica e gravidade alta — assume o pior, porque não saber
 *   o que uma linha significa é pior que saber que ela foi descartada.
 * - **Um bloco só.** Três listas de aviso em lugares diferentes era o caminho para o
 *   professor não ler nenhuma.
 */

export type Gravidade = 'alta' | 'media';
export type Origem = 'parser' | 'motor' | 'inss';

export type AvisoExibivel = {
  codigo: string;
  /** O que aconteceu e o que isso faz com o resultado, sem jargão de parser. */
  frase: string;
  /** O `detalhe` da origem, cru. */
  detalhe: string;
  /** Onde aconteceu: competência, ou página e vínculo. */
  contexto?: string;
  gravidade: Gravidade;
  origem: Origem;
  /**
   * `false` = código que esta versão da tela não conhece. A tela então **exibe o código
   * cru** junto da frase genérica (§6.5 do design da F3): sem isso, um motor mais novo que a
   * tela produziria um aviso impossível de identificar.
   */
  conhecido: boolean;
};

/**
 * Dicionário exaustivo: `Record` sobre a união dos códigos, então acrescentar um código no
 * parser ou no motor **não compila** até ganhar frase aqui.
 *
 * `alta` = dado perdido ou número afetado. `media` = a leitura se apoiou em algo e pede
 * conferência, mas nada foi descartado.
 */
export const FRASES: Record<WarningCode | CodigoAvisoTeto, { frase: string; gravidade: Gravidade }> =
  {
    LAYOUT_DESCONHECIDO: {
      frase:
        'Uma tabela do extrato veio num formato que não conhecemos, e as competências dela ficaram fora da conta.',
      gravidade: 'alta',
    },
    CELULA_ORFA: {
      frase:
        'Um valor do extrato ficou solto, sem coluna identificável. Pode ser remuneração que não entrou na conta.',
      gravidade: 'media',
    },
    COMPETENCIA_DUPLICADA: {
      frase:
        'O mesmo mês aparece mais de uma vez no extrato. Confira esse mês com atenção: pode ser repetição de leitura ou dois recolhimentos de verdade.',
      gravidade: 'media',
    },
    NATUREZA_INDEFINIDA: {
      frase:
        'Um vínculo veio sem tabela de meses, então o tipo dele foi deduzido do cadastro. Nenhum valor desse vínculo entrou na conta.',
      gravidade: 'alta',
    },
    NATUREZA_DIVERGENTE: {
      frase:
        'O formato da tabela e o tipo de filiado discordam num vínculo. Seguimos o formato da tabela, que é o que traz os valores.',
      gravidade: 'media',
    },
    TABELA_DESCARTADA: {
      frase:
        'Um vínculo trouxe duas tabelas de formatos diferentes, e só uma pôde ser usada. As competências da outra ficaram fora da conta.',
      gravidade: 'alta',
    },
    CABECALHO_REAPROVEITADO: {
      frase:
        'Uma tabela continuou na página seguinte sem repetir o cabeçalho. Lemos as colunas pela posição da página anterior — confira esses meses.',
      gravidade: 'media',
    },
    BLOCO_PULADO: {
      frase:
        'Um trecho do extrato não pôde ser lido, e as competências dele ficaram fora da conta.',
      gravidade: 'alta',
    },
    DUPLICADA_DESCARTADA: {
      frase:
        'O mesmo mês apareceu repetido numa tabela de salário, e consideramos só a primeira linha — somar dobraria a remuneração do mês e inventaria crédito.',
      gravidade: 'alta',
    },
    COMPETENCIA_INVALIDA: {
      frase: 'Um mês veio escrito de forma que não reconhecemos, e ficou fora do cálculo.',
      gravidade: 'alta',
    },
    ALIQUOTA_DIVERGENTE: {
      frase:
        'Num recolhimento próprio, o valor pago não corresponde à alíquota que o extrato indica. Não entendemos essa linha, então o resultado dela é duvidoso.',
      gravidade: 'media',
    },
    BASE_AUSENTE: {
      frase:
        'Há contribuição paga sem o salário de contribuição correspondente. Sem essa base não há como dizer quanto era devido, então esse valor ficou fora do total.',
      gravidade: 'alta',
    },
    PRESCRICAO_INDETERMINADA: {
      frase:
        'Não foi possível calcular o prazo de cinco anos de um mês, então ele não entrou no total a pedir.',
      gravidade: 'media',
    },
  };

const GENERICO = {
  frase:
    'Houve uma linha do extrato que não entendemos. O resultado pode estar incompleto — confira os valores contra o seu extrato.',
  gravidade: 'alta' as const,
};

const PESO: Record<Gravidade, number> = { alta: 0, media: 1 };

/** Ordem estável: gravidade alta primeiro, e dentro da gravidade a ordem de entrada. */
/** Primeira e última competência com tabela de teto, em meses desde o ano 0. */
const PRIMEIRA_VIGENCIA = (() => {
  const [ano, mes] = VIGENCIAS[0].vigencia.split('-');
  return Number(ano) * 12 + Number(mes);
})();
const ULTIMA_VIGENCIA = (() => {
  const [ano, mes] = VIGENCIAS[VIGENCIAS.length - 1].vigencia.split('-');
  return Number(ano) * 12 + Number(mes);
})();
/** Folga depois da última tabela: o ano corrente inteiro, até a portaria seguinte sair. */
const FOLGA_EM_MESES = 12;

/**
 * A data de referência vem do relógio do aparelho, e o motor decide prescrição com ela. Com
 * o relógio anos à frente, tudo aparece prescrito e o professor conclui que não tem nada a
 * pedir; anos atrás, mês já prescrito entra no total e ele leva ao e-CAC um pedido morto.
 * Nenhum dos dois é visível sem este aviso.
 */
function dataImplausivel(dataReferencia: string): boolean {
  const [ano, mes] = dataReferencia.split('-');
  const ordinal = Number(ano) * 12 + Number(mes);
  return ordinal < PRIMEIRA_VIGENCIA || ordinal > ULTIMA_VIGENCIA + FOLGA_EM_MESES;
}

export function avisosExibiveis(parse: ParseResult, teto: ResultadoTeto): AvisoExibivel[] {
  const lista: AvisoExibivel[] = [];

  if (dataImplausivel(teto.dataReferencia)) {
    lista.push({
      codigo: 'DATA_SUSPEITA',
      frase:
        'A data do seu aparelho está fora do período que esta calculadora cobre. Os prazos de cinco anos foram calculados com ela, então podem estar errados — confira a data e a hora do aparelho e leia o extrato de novo.',
      gravidade: 'alta',
      conhecido: true,
      origem: 'motor',
      detalhe: `data usada no cálculo: ${teto.dataReferencia}`,
    });
  }

  for (const aviso of parse.warnings) {
    const conhecida = FRASES[aviso.codigo];
    const { frase, gravidade } = conhecida ?? GENERICO;
    lista.push({
      codigo: aviso.codigo,
      frase,
      gravidade,
      conhecido: conhecida !== undefined,
      origem: 'parser',
      detalhe: aviso.detalhe,
      contexto:
        aviso.seq === undefined
          ? `página ${aviso.pagina}`
          : `página ${aviso.pagina}, vínculo ${aviso.seq}`,
    });
  }

  for (const aviso of teto.avisos) {
    const conhecida = FRASES[aviso.codigo];
    const { frase, gravidade } = conhecida ?? GENERICO;
    lista.push({
      codigo: aviso.codigo,
      frase,
      gravidade,
      conhecido: conhecida !== undefined,
      origem: 'motor',
      detalhe: aviso.detalhe,
      contexto: `competência ${aviso.competencia}`,
    });
  }

  // Os indicadores do INSS entram agrupados por código, com a descrição que o próprio
  // INSS escreveu na legenda do extrato, e só os que pedem conferência. `IREC-MEI` e
  // `IREC-LC123` ficam de fora daqui: são o regime de recolhimento, o motor os consome, e
  // chamá-los de pendência era avisar sobre o dado que entendemos.
  for (const indicador of indicadoresExibiveis(parse.extrato).avisos) {
    lista.push({
      codigo: indicador.codigo,
      frase:
        indicador.descricao === ''
          ? 'O INSS marcou este ponto do seu extrato. Isso pode afetar os valores registrados — vale conferir no extrato original.'
          : `O INSS marcou: ${indicador.descricao}`,
      // `media`, inclusive para código que não classificamos: um indicador que não
      // conhecemos pede conferência, mas não é dado perdido — e `alta` ao lado de uma
      // tabela descartada apagaria a diferença. Falhar aberto está em aparecer e em
      // mostrar o código cru, não em inflar a gravidade.
      gravidade: 'media',
      // "Conhecido" aqui é "a tela sabe dizer o que isto é". Sem descrição na legenda ela
      // não sabe, mesmo classificando o código — e então o `BlocoAvisos` mostra o código
      // cru, que é o que o professor tem para conferir no extrato.
      conhecido: indicador.classificado && indicador.descricao !== '',
      origem: 'inss',
      detalhe: indicador.onde,
    });
  }

  return lista.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade]);
}
