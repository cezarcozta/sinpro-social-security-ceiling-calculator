import type { ParseResult, WarningCode } from '@/lib/cnis';
import type { CodigoAvisoTeto, ResultadoTeto } from '@/lib/teto';

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
    'Houve uma linha do extrato que não entendemos. O resultado pode estar incompleto — confira com o sindicato.',
  gravidade: 'alta' as const,
};

const PESO: Record<Gravidade, number> = { alta: 0, media: 1 };

/** Ordem estável: gravidade alta primeiro, e dentro da gravidade a ordem de entrada. */
export function avisosExibiveis(parse: ParseResult, teto: ResultadoTeto): AvisoExibivel[] {
  const lista: AvisoExibivel[] = [];

  for (const aviso of parse.warnings) {
    const { frase, gravidade } = FRASES[aviso.codigo] ?? GENERICO;
    lista.push({
      codigo: aviso.codigo,
      frase,
      gravidade,
      origem: 'parser',
      detalhe: aviso.detalhe,
      contexto:
        aviso.seq === undefined
          ? `página ${aviso.pagina}`
          : `página ${aviso.pagina}, vínculo ${aviso.seq}`,
    });
  }

  for (const aviso of teto.avisos) {
    const { frase, gravidade } = FRASES[aviso.codigo] ?? GENERICO;
    lista.push({
      codigo: aviso.codigo,
      frase,
      gravidade,
      origem: 'motor',
      detalhe: aviso.detalhe,
      contexto: `competência ${aviso.competencia}`,
    });
  }

  // Os indicadores são do próprio INSS, não códigos nossos: vão como o INSS os escreve,
  // num aviso só, sem dicionário de tradução neste ciclo.
  const comIndicadores = parse.extrato.vinculos.filter((v) => (v.indicadores?.length ?? 0) > 0);
  if (comIndicadores.length > 0) {
    lista.push({
      codigo: 'INDICADORES_INSS',
      frase:
        'O INSS marcou pendência em vínculos do seu extrato. Isso pode afetar os valores registrados — vale conferir com o sindicato.',
      gravidade: 'media',
      origem: 'inss',
      detalhe: comIndicadores
        .map((v) => `vínculo ${v.seq}: ${v.indicadores!.join(', ')}`)
        .join('; '),
    });
  }

  return lista.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade]);
}
