import type { ParseResult } from '@/lib/cnis';
import type { Camada, ResultadoCompetencia, ResultadoTeto } from '@/lib/teto';

/**
 * Fixtures compartilhadas da F3.
 *
 * `RESULTADO_GATILHOS` liga, de propósito, **todos** os gatilhos da tabela da §7 do design:
 * camada estimada e camada lida, base excedente, mês prescrito, mês urgente, achado do MEI,
 * competência não avaliada, aviso, 13º, e um ano inteiro sem nenhum mês acima do teto.
 *
 * Valores pinados, porque os testes de veredito e de conformidade dependem deles:
 *
 * - `dataReferencia` é `2026-11-19`;
 * - a última competência não-13º é `09/2026`, com `retidoAMaiorCentavos: 11842` — sangria
 *   **ativa** e não defasada;
 * - `resumo.totalAPedirCentavos` (23030) e `totalPrescritoCentavos` (2000) são a soma exata
 *   dos `retidoAMaiorCentavos` das competências no prazo e das prescritas. Se essa soma
 *   deixar de fechar, o invariante de `derivarVeredito` quebra por defeito da fixture.
 */

const clt = (base: number, retido: number, devido: number): Camada => ({
  natureza: 'CLT',
  baseCentavos: base,
  retidoCentavos: retido,
  devidoCentavos: devido,
  lido: false,
});

const proprio = (base: number, retido: number, devido: number): Camada => ({
  natureza: 'CI_PROPRIO',
  baseCentavos: base,
  retidoCentavos: retido,
  devidoCentavos: devido,
  lido: true,
});

const COMPETENCIAS: ResultadoCompetencia[] = [
  {
    // prescrito: prazo venceu em 20/03/2026, antes da data de referência
    competencia: '02/2021',
    decimoTerceiro: false,
    tetoCentavos: 643357,
    somaBaseCentavos: 700000,
    excedeuTeto: true,
    baseExcedenteCentavos: 56643,
    retidoCentavos: 50000,
    devidoCentavos: 48000,
    retidoAMaiorCentavos: 2000,
    camadas: [clt(700000, 50000, 48000)],
    multiplosVinculos: true,
    prescricao: {
      prescreveEm: '2026-03-20',
      noPrazo: false,
      diasRestantes: -244,
      urgente: false,
    },
  },
  {
    // urgente: prescreve em 20/01/2027, 62 dias depois da data de referência
    competencia: '12/2021',
    decimoTerceiro: false,
    tetoCentavos: 643357,
    somaBaseCentavos: 800000,
    excedeuTeto: true,
    baseExcedenteCentavos: 156643,
    retidoCentavos: 55000,
    devidoCentavos: 51900,
    retidoAMaiorCentavos: 3100,
    camadas: [clt(800000, 55000, 51900)],
    multiplosVinculos: true,
    prescricao: { prescreveEm: '2027-01-20', noPrazo: true, diasRestantes: 62, urgente: true },
  },
  {
    // o caso do oráculo da F2: 5.000 + 4.500 em 08/2024, teto 7.786,02
    competencia: '08/2024',
    decimoTerceiro: false,
    tetoCentavos: 778602,
    somaBaseCentavos: 950000,
    excedeuTeto: true,
    baseExcedenteCentavos: 171398,
    retidoCentavos: 96764,
    devidoCentavos: 90886,
    retidoAMaiorCentavos: 5878,
    camadas: [clt(950000, 96764, 90886)],
    multiplosVinculos: true,
    prescricao: {
      prescreveEm: '2029-09-20',
      noPrazo: true,
      diasRestantes: 1036,
      urgente: false,
    },
  },
  {
    competencia: '12/2024',
    decimoTerceiro: false,
    tetoCentavos: 778602,
    somaBaseCentavos: 700000,
    excedeuTeto: false,
    baseExcedenteCentavos: 0,
    retidoCentavos: 48000,
    devidoCentavos: 48000,
    retidoAMaiorCentavos: 0,
    camadas: [clt(700000, 48000, 48000)],
    multiplosVinculos: true,
    prescricao: {
      prescreveEm: '2030-01-20',
      noPrazo: true,
      diasRestantes: 1158,
      urgente: false,
    },
  },
  {
    // 13º: teto próprio, não soma com 12/2024
    competencia: '13/2024',
    decimoTerceiro: true,
    tetoCentavos: 778602,
    somaBaseCentavos: 800000,
    excedeuTeto: true,
    baseExcedenteCentavos: 21398,
    retidoCentavos: 55000,
    devidoCentavos: 52790,
    retidoAMaiorCentavos: 2210,
    camadas: [clt(800000, 55000, 52790)],
    multiplosVinculos: true,
    prescricao: {
      prescreveEm: '2030-01-20',
      noPrazo: true,
      diasRestantes: 1158,
      urgente: false,
    },
  },
  {
    // 2025 inteiro sem nenhum mês acima do teto, e sem múltiplos vínculos
    competencia: '05/2025',
    decimoTerceiro: false,
    tetoCentavos: 815741,
    somaBaseCentavos: 600000,
    excedeuTeto: false,
    baseExcedenteCentavos: 0,
    retidoCentavos: 42000,
    devidoCentavos: 42000,
    retidoAMaiorCentavos: 0,
    camadas: [clt(600000, 42000, 42000)],
    multiplosVinculos: false,
    prescricao: {
      prescreveEm: '2030-06-20',
      noPrazo: true,
      diasRestantes: 1309,
      urgente: false,
    },
  },
  {
    // sangria ativa: última competência não-13º, com camada estimada E camada lida
    competencia: '09/2026',
    decimoTerceiro: false,
    tetoCentavos: 847555,
    somaBaseCentavos: 1000000,
    excedeuTeto: true,
    baseExcedenteCentavos: 152445,
    retidoCentavos: 103000,
    devidoCentavos: 91158,
    retidoAMaiorCentavos: 11842,
    camadas: [clt(700000, 70000, 62000), proprio(300000, 33000, 29158)],
    multiplosVinculos: true,
    prescricao: {
      prescreveEm: '2031-10-20',
      noPrazo: true,
      diasRestantes: 1796,
      urgente: false,
    },
  },
];

export const RESULTADO_GATILHOS: ResultadoTeto = {
  dataReferencia: '2026-11-19',
  competencias: COMPETENCIAS,
  ignoradasSemTabela: ['07/2019', '08/2019'],
  achados: [{ tipo: 'MEI_DAS_INDEVIDO', competencias: ['09/2026'], valorCentavos: 7590 }],
  avisos: [
    {
      codigo: 'BASE_AUSENTE',
      competencia: '09/2026',
      detalhe: 'contribuição de R$ 75,90 sem salário de contribuição',
    },
  ],
  resumo: {
    mesesComMultiplosVinculos: 6,
    mesesAcimaDoTeto: 5,
    totalAPedirCentavos: 23030,
    totalPrescritoCentavos: 2000,
  },
};

export const RESULTADO_VAZIO: ResultadoTeto = {
  dataReferencia: '2026-11-19',
  competencias: [],
  ignoradasSemTabela: [],
  achados: [],
  avisos: [],
  resumo: {
    mesesComMultiplosVinculos: 0,
    mesesAcimaDoTeto: 0,
    totalAPedirCentavos: 0,
    totalPrescritoCentavos: 0,
  },
};

/**
 * O extrato correspondente. As fontes pagadoras de `08/2024` e `09/2026` existem aqui e
 * **não** na saída do motor: `camadas` é por natureza, não por empregador.
 */
export const PARSE_GATILHOS: ParseResult = {
  extrato: {
    filiado: { nome: 'MARIA DE EXEMPLO', nit: '123.45678.90-1', cpf: '111.222.333-44' },
    legenda: [],
    vinculos: [
      {
        seq: 1,
        codigoEmp: '11.111.111/0001-11',
        tipoFiliado: 'Empregado',
        natureza: 'CLT',
        indicadores: ['IREM-INDPEND'],
        remuneracoes: [
          { competencia: '02/2021', valorCentavos: 700000, indicadores: [] },
          { competencia: '12/2021', valorCentavos: 800000, indicadores: [] },
          { competencia: '08/2024', valorCentavos: 500000, indicadores: [] },
          { competencia: '12/2024', valorCentavos: 700000, indicadores: [] },
          { competencia: '13/2024', valorCentavos: 800000, indicadores: [] },
          { competencia: '05/2025', valorCentavos: 600000, indicadores: [] },
          { competencia: '09/2026', valorCentavos: 700000, indicadores: ['PREM-EXT'] },
        ],
      },
      {
        seq: 2,
        codigoEmp: '22.222.222/0001-22',
        tipoFiliado: 'Empregado',
        natureza: 'CLT',
        remuneracoes: [
          { competencia: '08/2024', valorCentavos: 450000, indicadores: [] },
          // duplicada na mesma tabela: o motor fica com a primeira, a tela faz igual
          { competencia: '08/2024', valorCentavos: 450000, indicadores: [] },
        ],
      },
      {
        seq: 3,
        codigoEmp: '98.765.432',
        tipoFiliado: 'Contribuinte Individual',
        natureza: 'CI_PROPRIO',
        contribuicoes: [
          {
            competencia: '09/2026',
            dataPgto: '20/10/2026',
            contribuicaoCentavos: 33000,
            salarioContribuicaoCentavos: 300000,
            indicadores: ['IREC-MEI'],
          },
        ],
      },
    ],
  },
  warnings: [
    { codigo: 'COMPETENCIA_DUPLICADA', pagina: 4, seq: 2, detalhe: '08/2024 aparece duas vezes' },
    { codigo: 'BLOCO_PULADO', pagina: 6, detalhe: '2 competências ilegíveis' },
  ],
};
