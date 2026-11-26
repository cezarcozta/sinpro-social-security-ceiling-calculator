# F2 — Motor de Cálculo de Teto (design)

Data: 2026-11-18. Antecessor: `2026-11-18-f1-parser-cnis-design.md`.

Cobre **dois ciclos de entrega**: a F1.5 (pré-requisito, entrega sozinha) e a F2. O plano
de implementação separa as fases.

## 1. Objetivo

Triagem: dizer ao professor **se** ele contribuiu acima do teto do INSS em cada mês dos
últimos cinco anos e **quanto** — em base excedente (aritmética exata) e em dinheiro
retido a maior (estimativa). Entrada: `CnisExtrato` produzido pela F1. Saída: um objeto
de resultado. Nenhuma UI: o dashboard é a F3.

## 2. Decisões tomadas

### 2.1 O "quanto" é modelo progressivo, não alíquota máxima

A `AGENTS.md` especifica `14% × (soma − teto)` e o exemplo JSON confirma (`239,95`).
**Essa fórmula foi descartada.** Desde a EC 103/2019 o desconto do empregado é progressivo
por faixas, e cada empregador aplica a tabela inteira sobre a *sua* remuneração —
inclusive as faixas baratas. O excedente não foi descontado a 14%.

No próprio exemplo da spec (08/2024, R$ 5.000 + R$ 4.500, teto R$ 7.786,02):

| | |
|---|---|
| Retido pela fonte A — `progressivo(5.000,00)` | 518,82 |
| Retido pela fonte B — `progressivo(4.500,00)` | 448,82 |
| **Total retido** | **967,64** |
| Devido — `progressivo(7.786,02)` | 908,86 |
| **Retido a maior (real)** | **58,78** |
| Pela fórmula da `AGENTS.md` | 239,96 |

A fórmula da spec erra ~4x para cima. Como o repositório é público, um número inflado que
não se sustenta diante do RH ou da Receita é risco de credibilidade. Fonte do modelo: IN RFB 2.110/2022 (arts. 36 e 49) e Decreto 3.048/99
(art. 216), com exemplos trabalhados que reproduzem exatamente `518,82` e `908,86`.

Regra confirmada:

- **Com** a declaração de múltiplos vínculos, cada empregador desconta "observadas as
  faixas já tributadas nas empresas anteriores" → total `= progressivo(min(soma, teto))`.
  É o **devido**.
- **Sem** a declaração — a situação do professor — cada empregador desconta a tabela
  inteira sobre a própria base → total `= Σ progressivo(min(base_i, teto))`. É o **retido**.

O `min(base_i, teto)` por fonte é obrigatório: sem ele, um professor com **um só** vínculo
de R$ 9.000 apareceria com retenção a maior, quando o empregador descontou corretamente.
Com ele, meses de vínculo único dão sempre zero.

### 2.2 Recorte: cobre 2021–2026, elegibilidade marcada mês a mês

A prescrição corre **por pagamento**, não por ano civil: CTN art. 168, I, com a LC
118/2005, que fixou o termo inicial na data de cada recolhimento. "Cada mês tem o seu
prazo."

Recortar por "últimos 5 anos civis fechados" foi avaliado e **falha dos dois lados**. Em
18/11/2026 isso daria 2021–2025, que inclui ~10 meses de 2021 já prescritos no total
"a pedir" e descarta 01/2026–10/2026, que estão no prazo e têm o teto mais alto.

O motor portanto:

- calcula toda competência que tenha tabela (hoje 01/2021–12/2026);
- marca cada uma com `noPrazo` contra uma `dataReferencia` **injetada** por quem chama
  (nunca `new Date()` interno — o teste tem que ser determinístico);
- soma dois totais separados: `totalAPedirCentavos` (só `noPrazo`) e
  `totalPrescritoCentavos`;
- devolve competência sem tabela em `ignoradasSemTabela` — não é erro.

Agrupar por ano civil é **apresentação**: a F3 deriva. O motor não emite `porAno`.

### 2.3 Vínculos não-CLT entram no cálculo

Decisão revista em relação à F1, que cobria só CLT. Motivo: professor com escola CLT +
aula particular ou MEI é caso real, e ignorar o vínculo não-CLT **subestima** a travessia
do teto — produz falso negativo ("você não passou") para quem passou.

A pesquisa mostrou que "não-CLT" são três coisas distintas, e que o extrato real de
exemplo contém todas:

| Natureza | Base no CNIS | Alíquota | Soma no teto? | Caso típico |
|---|---|---|---|---|
| `CLT` | remuneração | progressiva | sim | escola |
| `CI_PRESTADOR` | remuneração, com *tomador* | 11% retido na fonte | sim, integralmente | aula particular paga por PJ |
| `CI_PROPRIO` | salário de contribuição **+ contribuição paga** | 5% (MEI) / 11% (Plano Simplificado) / 20% | sim | MEI, recolhimento próprio |

**Assimetria central do desenho:** `CLT` e `CI_PRESTADOR` informam apenas a *remuneração*,
então o desconto é **estimativa**. `CI_PROPRIO` informa a *contribuição efetivamente paga*,
então é **leitura**. A confiança nos dois números é diferente e a saída precisa dizer qual
é qual (`camadas[].lido`).

Isso também dissolve o problema de inferir alíquota pelo indicador: para `CI_PROPRIO` a
taxa efetiva sai da própria divisão (`52,25 / 1.045,00 = 5%`), e os indicadores passam a
servir de **conferência**, não de fonte da verdade.

### 2.4 O MEI gera um achado próprio

O MEI recolhe 5% do salário mínimo via DAS, e essa contribuição só integra o salário de
contribuição se complementada em +15%. Ou seja, o MEI quase não move a travessia do teto.
Mas gera um achado mais simples e mais acionável: se o professor **já bate o teto** só com
os vínculos de empregado, a parcela de INSS do DAS é integralmente indevida — da ordem de
R$ 911/ano em 2026 (R$ 75,90 × 12).

O caminho de restituição é **outro**: Anexo I da IN RFB 2.055/2021, em processo no e-CAC,
e **não** PER/DCOMP Web. Por isso sai como achado separado, não somado ao total geral.

## 3. F1.5 — pré-requisito

Hoje `parse-cnis.ts` classifica vínculo não-CLT em `ignorados: VinculoIgnorado[]`
(`{ seq, tipoFiliado, motivo }`) e **descarta as remunerações**. Verificado na fixture
real: as competências dos vínculos 2, 3 e 5 são perdidas; não há vazamento para o vínculo
CLT anterior e nenhum warning é emitido.

O extrato de exemplo tem **quatro** layouts de tabela, dos quais a F1 lê um:

| Cabeçalho | Natureza | Lido hoje? |
|---|---|---|
| `Competência \| Remuneração \| Indicadores` | `CLT` | sim |
| `Competência \| Data Pgto. \| Contribuição \| Salário Contribuição \| Indicadores` | `CI_PROPRIO` | não |
| `Competência \| Contrat. \| Estabelecimento \| Tomador \| Forma Prestação Serviço \| Remuneração \| Indicadores` | `CI_PRESTADOR` | não |
| `Valores Consolidados por Ano Civil` | checksum nativo | só como marcador de fim |

A F1.5 entrega:

- `Vinculo.natureza: 'CLT' | 'CI_PRESTADOR' | 'CI_PROPRIO'`; `ignorados` sai do modelo.
- `CLT` e `CI_PRESTADOR` seguem com `Remuneracao { competencia, valorCentavos, indicadores }`
  — o tipo atual serve.
- `CI_PROPRIO` ganha tipo novo:
  `Contribuicao { competencia, dataPgto, contribuicaoCentavos, salarioContribuicaoCentavos, indicadores }`
  — duas cifras, não uma.
- `LAYOUT_DESCONHECIDO` continua cobrindo cabeçalho não reconhecido. Nenhum descarte
  silencioso.

Fixture: o extrato real já cobre os dois layouts novos (seq 2 e 3 próprio, seq 5
prestador). Geometria verdadeira, sem sintetizar nada.

## 4. F2 — arquitetura

Biblioteca pura em `src/lib/teto/`. Entrada `CnisExtrato` + `dataReferencia`. Sem UI, sem
I/O, sem `new Date()`. Um `.test.ts` por módulo, espelhando a estrutura da F1.

| Arquivo | Responsabilidade | Conhece CNIS? |
|---|---|---|
| `tabelas.ts` | as 7 vigências (teto + faixas); resolve competência → tabela | não |
| `aliquotas.ts` | `contribuicao(base, tabela)` — progressivo puro | não |
| `competencias.ts` | `CnisExtrato` → competências com as três naturezas separadas; 13º apartado | sim |
| `cascata.ts` | a ordem de prioridade entre as naturezas | não |
| `prescricao.ts` | competência + `dataReferencia` → data de prescrição, dias restantes | não |
| `calcular.ts` | orquestra e monta o resumo | sim |
| `types.ts` / `index.ts` | tipos e superfície pública | — |

`aliquotas.ts` e `cascata.ts` não conhecem CNIS; `competencias.ts` não conhece alíquotas.
Cada um testável sozinho com entradas literais.

### 4.1 Tabelas

Centavos inteiros; alíquota em pontos-base. Os limites são o **topo acumulado** de cada
faixa, como as portarias publicam.

```
'2021-01' teto 643357  faixas [[110000,750],[220348,900],[330522,1200],[643357,1400]]
'2022-01' teto 708722  faixas [[121200,750],[242735,900],[364103,1200],[708722,1400]]
'2023-01' teto 750749  faixas [[130200,750],[257129,900],[385694,1200],[750749,1400]]
'2023-05' teto 750749  faixas [[132000,750],[257129,900],[385694,1200],[750749,1400]]
'2024-01' teto 778602  faixas [[141200,750],[266668,900],[400003,1200],[778602,1400]]
'2025-01' teto 815741  faixas [[151800,750],[279388,900],[419083,1200],[815741,1400]]
'2026-01' teto 847555  faixas [[162100,750],[290284,900],[435427,1200],[847555,1400]]
```

Portarias de origem, em comentário por entrada: SEPRT 477/2021, MTP/ME 12/2022,
MPS/MF 26/2023, MPS/MF 27/2023, MPS/MF 2/2024, MPS/MF 6/2025, MPS/MF 13/2026.

2023 tem duas vigências porque o salário mínimo mudou em maio; o teto não mudou, só o
limite da primeira faixa. A chave é a **competência**, não o ano. Adicionar 2027 é uma
linha.

## 5. Aritmética inteira

Todo valor monetário é **centavos inteiros**, ponta a ponta; nenhum campo de saída em
reais. Toda alíquota é **pontos-base inteiros** (`500`, `750`, `900`, `1100`, `1200`,
`1400`, `2000`).

A F1 já é segura nesse ponto: `parseValorCentavos` em `table.ts:56` converte por
manipulação de string (`"1.045,00"` → `"104500"` → `Number`), sem nunca materializar
`1045.00` nem multiplicar por 100.

O único ponto da F2 onde aparece fração:

```ts
/** base em centavos (inteiro), bps em pontos-base (750 = 7,5%). Devolve centavos inteiros. */
const aplicar = (base: number, bps: number): number => {
  const bruto = base * bps + 5000;              // +5000 = arredondamento meio-para-cima
  return (bruto - (bruto % 10000)) / 10000;     // divisão exata: múltiplo de 10000
};
```

Esta forma, e não `Math.floor(bruto / 10000)`: `%` e `-` sobre inteiros abaixo de 2^53 são
exatos, e `bruto - (bruto % 10000)` é múltiplo exato de 10000, então a divisão devolve um
inteiro exatamente representável. Não depende do arredondamento do IEEE754.

Magnitude: o maior produto possível é `847555 × 1400 = 1.186.577.000`, contra
`Number.MAX_SAFE_INTEGER = 9.007.199.254.740.991` — ~7 ordens de grandeza de folga.
`BigInt` seria cerimônia.

Restrições que valem como regra, não como estilo:

- `*` e `/` com dinheiro só dentro de `aplicar()` e `bpsDe()` (secção 6.1). Em
  nenhum outro lugar.
- Proibido `parseFloat`, `toFixed`, `Number(x) / 100` em `src/lib/teto/`.
- A conferência da taxa efetiva do `CI_PROPRIO` é feita por **multiplicação cruzada
  inteira** com tolerância de 1 centavo (`confere()`, secção 6.1), nunca comparando
  com `0.05`.
- Um teste percorre a saída e afirma `Number.isInteger` em todo campo `*Centavos`.

Formatar para reais é da F3, na borda da tela.

## 6. Regras de cálculo

### 6.1 A cascata

Por competência, com a tabela `T` da vigência. A ordem é legal: o empregado contribui
primeiro, o CI declara sobre o que sobrar até o teto.

```
1. CLT
   retido  = Σ contribuicao(min(base_i, T.teto), T)
   devido  = contribuicao(min(Σ base_i, T.teto), T)
   margem1 = max(0, T.teto − min(Σ base_i, T.teto))

2. CI_PRESTADOR  (tomador retém 11%)
   retido  = Σ aplicar(base_i, 1100)
   devido  = aplicar(min(Σ base_i, margem1), 1100)
   margem2 = max(0, margem1 − min(Σ base_i, margem1))

3. CI_PROPRIO  (valor pago está escrito no extrato)
   retido     = Σ contribuicaoCentavos                  ← LEITURA
   bpsEfetivo = bpsDe(retido, Σ salarioContribuicao)
   devido     = aplicar(min(Σ salarioContribuicao, margem2), bpsEfetivo)

retidoAMaior = (1.retido − 1.devido) + (2.retido − 2.devido) + (3.retido − 3.devido)
```

Quando o CLT sozinho está abaixo do teto e o CI empurra para cima, o excesso é **todo** da
camada do CI — o cálculo fica mais limpo que o caso CLT+CLT.

`bpsDe` é a segunda e última operação com fração do motor, e também tem forma inteira:

```ts
/** Taxa efetiva em pontos-base, a partir de dois inteiros em centavos. */
const bpsDe = (contribuicao: number, base: number): number => {
  if (base <= 0) return 0;
  const bruto = contribuicao * 10000 * 2 + base;   // meio-para-cima sobre `base`
  const d = base * 2;
  return (bruto - (bruto % d)) / d;
};
```

`bpsEfetivo` é então **conferido** contra o que os indicadores prometem — `IREC-MEI` → 500,
`IREC-LC123` sozinho → 1100, nenhum → 2000. A conferência é por multiplicação cruzada
inteira, nunca por divisão:

```ts
// "o valor pago bate com a alíquota esperada, a menos de 1 centavo?"
const confere = (contribuicao: number, base: number, bpsEsperado: number): boolean =>
  Math.abs(contribuicao - aplicar(base, bpsEsperado)) <= 1;
```

Divergência emite aviso — significa que não entendemos a linha. Nunca silêncio.

### 6.2 13º salário

Competência `13/AAAA` é base própria com teto próprio (Lei 8.212/91, art. 28, §7º). Usa a
tabela de `12/AAAA` e **não** soma com `12/AAAA`. A mesma cascata roda sobre ela, isolada.
A F1 já lê `MM=13` como competência própria.

### 6.3 Arredondamento

**Por faixa**, meio-para-cima, como faz folha de pagamento. Verificado: os exemplos de
referência (`518,82`, `908,86`) saem idênticos arredondando por faixa ou só no fim — os
exemplos não distinguem as duas escolhas. Um teste fixa a escolha para que ninguém a
troque por acidente.

### 6.4 Prescrição

O recolhimento vence no dia 20 do mês seguinte à competência. O "mês seguinte" **vira o
ano** quando `MM = 12`, e ignorar isso é um erro de um ano inteiro:

| Competência | Recolhimento vence | Prescreve em |
|---|---|---|
| `01/2021` | 20/02/2021 | 20/02/2026 |
| `11/2021` | 20/12/2021 | 20/12/2026 |
| `12/2024` | 20/01/**2025** | 20/01/**2030** |
| `13/2024` | 20/01/2025 | 20/01/2030 |

Regra única, sem caso especial: trate `13/AAAA` como competência `12/AAAA` para fins de
prescrição (a gratificação é paga em dezembro e recolhida com a competência de dezembro).
Em seguida, `prescreveEm = 20 / ((MM mod 12) + 1) / (AAAA + 5 + (MM == 12 ? 1 : 0))`.

`noPrazo = dataReferencia <= prescreveEm` — **com o igual**: o prazo corre até o fim do
seu último dia, então quem pede no dia 20 ainda está no prazo. (Corrigido em 19/11/2026:
esta linha dizia `<` e contradizia o código, que sempre usou `<=` e tem teste fixando a
virada em 19, 20 e 21/02. Uma spec que contradiz código testado convida alguém a
"corrigir" o código de volta e perder um dia de prazo de cada competência.)

`diasRestantes ≤ 90` marca `urgente` — é o que transforma a triagem em ação.

### 6.5 Achado do MEI

Se `margem2 == 0` e existem linhas `CI_PROPRIO` com `IREC-MEI`, a parcela de INSS do DAS é
integralmente indevida. Sai em `achados` como `MEI_DAS_INDEVIDO`, separada do total geral,
porque o caminho de restituição é o Anexo I da IN RFB 2.055/2021 no e-CAC, não o
PER/DCOMP Web.

## 7. Saída

```ts
type ResultadoCompetencia = {
  competencia: string;              // "08/2024" | "13/2024"
  decimoTerceiro: boolean;
  tetoCentavos: number;
  somaBaseCentavos: number;
  excedeuTeto: boolean;
  baseExcedenteCentavos: number;    // aritmética exata
  retidoCentavos: number;
  devidoCentavos: number;
  retidoAMaiorCentavos: number;     // estimativa
  camadas: {
    natureza: 'CLT' | 'CI_PRESTADOR' | 'CI_PROPRIO';
    baseCentavos: number;
    retidoCentavos: number;
    devidoCentavos: number;
    lido: boolean;                  // true = valor escrito no extrato; false = estimado
  }[];
  multiplosVinculos: boolean;
  prescricao: { prescreveEm: string; noPrazo: boolean; diasRestantes: number; urgente: boolean };
};

type ResultadoTeto = {
  dataReferencia: string;
  competencias: ResultadoCompetencia[];
  ignoradasSemTabela: string[];
  achados: { tipo: 'MEI_DAS_INDEVIDO'; competencias: string[]; valorCentavos: number }[];
  avisos: { codigo: string; competencia: string; detalhe: string }[];
  resumo: {
    mesesComMultiplosVinculos: number;
    mesesAcimaDoTeto: number;
    totalAPedirCentavos: number;      // só noPrazo
    totalPrescritoCentavos: number;
  };
};
```

`camadas[].lido` é a assimetria da seção 2.3 ficando visível, para a F3 rotular confiança.
`mesesAcimaDoTeto` conta **competências distintas**, o que corrige de passagem a pendência
registrada na F1 ("competências lidas soma registros, não meses distintos").

Sem `porAno`.

## 8. Testes

A F2 se testa com literais `CnisExtrato`: nada de PDF, nada de camada de texto. O builder
de camada de texto sintética segue como pendência da F1 e a F2 não depende dele.

**Oráculo externo.** Há exemplos trabalhados publicados, citando a IN 2.110 e o Decreto
3.048/99, com os números fechados: `518,82`, `908,86`, `176,82`, `154,00`, `330,82` e o
caso CI de `306,46`. Viram testes diretos — não é o cálculo conferindo consigo mesmo.

Demais casos:

- limites de faixa exatos e ±1 centavo;
- soma igual ao teto → zero;
- **vínculo único acima do teto → zero** (o caso que o `min` conserta);
- 13º isolado não somando com dezembro;
- troca de vigência de 04/2023 para 05/2023;
- competência sem tabela → `ignoradasSemTabela`;
- prescrição na data exata de virada, e a faixa `urgente`;
- cascata: CLT 5.000 + prestador 4.000 em 2024 → `margem1 = 2.786,02`, excesso só na
  camada do prestador;
- MEI com `margem2 == 0` → achado `MEI_DAS_INDEVIDO`;
- divergência de `bpsEfetivo` → aviso;
- varredura `Number.isInteger` em todo campo `*Centavos`.

## 9. Disclaimers obrigatórios na interface

Estes são **requisitos de UI**, não sugestões, e valem para a F3 (dashboard) e a F4
(declaração). Estão neste spec porque é a natureza da saída da F2 que os torna
necessários: o motor devolve estimativas ao lado de leituras, e meses fora do prazo ao
lado de meses válidos. Exibir esses números sem qualificação é afirmar mais do que o dado
sustenta.

Cada um é acionado por um campo da saída, para que a F3 implemente a regra e não dependa
de alguém lembrar:

| Condição na saída | O que a UI precisa dizer | Onde |
|---|---|---|
| `camadas[].lido === false` (CLT, CI-prestador) | O valor em dinheiro é **estimativa**: o CNIS informa a remuneração, não quanto cada fonte descontou. O desconto é simulado pela tabela progressiva. | junto de todo valor em dinheiro dessas camadas |
| `camadas[].lido === true` (CI próprio / MEI) | Este valor é **lido do extrato** — foi o que o INSS registrou como pago. | junto do valor, distinguindo visualmente do anterior |
| `baseExcedenteCentavos > 0` | A base excedente é **aritmética exata** (soma menos teto). Só o valor em dinheiro é estimado. | no resumo executivo, separando os dois números |
| `prescricao.noPrazo === false` | Este mês **já passou do prazo de 5 anos** e não entra no total a pedir. Está listado para conferência, não para pedido. | em cada linha prescrita, e o total prescrito separado do total a pedir |
| `prescricao.urgente === true` | Este mês prescreve em até 90 dias. | destaque na linha |
| `achados[].tipo === 'MEI_DAS_INDEVIDO'` | O caminho de restituição é **outro**: Anexo I da IN RFB 2.055/2021, em processo no e-CAC, e não PER/DCOMP Web. Não somar ao total geral. | no achado, fora do total principal |
| `ignoradasSemTabela.length > 0` | Estas competências **não foram avaliadas** por estarem fora do período coberto. | lista visível, não silenciada |
| `avisos.length > 0` | Houve linha do extrato que não entendemos. O resultado pode estar incompleto. | aviso de topo, não escondido em detalhe |
| `decimoTerceiro === true` | O 13º tem **teto próprio**, calculado em separado do salário de dezembro. | na linha do 13º |
| sempre | O resultado é **estimativa de triagem**, não cálculo oficial nem parecer jurídico ou contábil. Confira os números contra o seu extrato antes de levar ao RH ou pedir restituição. | rodapé permanente e no PDF da F4 |
| sempre | Nenhum dado do extrato sai do navegador. | reforço da garantia da F1, que é o que faz o professor subir o arquivo |

Dois princípios por trás da tabela:

- **Nunca um número sozinho.** Todo valor em dinheiro aparece ao lado de sua natureza
  (estimado ou lido) e de sua elegibilidade (no prazo ou prescrito). Um número solto é o
  número que o professor leva ao RH.
- **Falhar aberto, não fechado.** Aviso, competência não avaliada e camada incompleta são
  exibidos, nunca suprimidos para a tela ficar limpa. A pendência da F1 de "fase de
  conferência na UI" — mostrar a tabela mês a mês e pedir ao professor que confira contra
  o PDF antes de usar o número — continua valendo e é o par natural desta seção.

## 10. Riscos e pendências conhecidas

- ~~**Tabelas de 2022 a 2025 vêm de fonte secundária.**~~ **Fechado em 19/11/2026:** as
  sete vigências foram conferidas em fonte primária, valor por valor (quatro limites de
  faixa + teto por vigência), contra o texto das portarias (MTP/ME 12/2022; MPS/MF 26/2023,
  Anexo II; MPS/MF 27/2023, Anexo II-A; MPS/MF 2/2024; MPS/MF 6/2025) e as páginas oficiais
  do INSS (histórico, para 2021; tabela vigente, para 2026). **Zero divergências.** Um teste
  de fixação em `tabelas.test.ts` pina os 35 números para que uma edição futura não os troque
  em silêncio.
- **O dinheiro é estimativa para CLT e CI_PRESTADOR.** O CNIS informa a remuneração, não o
  que cada fonte efetivamente descontou. O resultado tem que vir rotulado como estimativa
  na F3.
- **`IREC-LC123-SUP`** (recolhimento no Plano Simplificado acima da base do salário mínimo,
  cujo excesso é restituível) não aparece na fixture e não está tratado. Candidato a
  achado próprio num ciclo futuro.
- **`PSC-MEN-SM` / `PSC-MEN-SM-EC103`** (salário de contribuição abaixo do mínimo) aparecem
  na fixture, inclusive em vínculo CLT, e não são tratados. Afetam agrupamento e
  complementação de competência, não o teto — fora do escopo da F2, mas registrados.
- **Procedimento de restituição divergente entre fontes** (PER/DCOMP Web vs. declaração
  anual de IR). Importa para o texto da F4, não para a aritmética da F2.
- **`Valores Consolidados por Ano Civil`** continua sem uso como checksum, conforme a
  pendência da F1. O motor da F2 seria o consumidor natural dessa conferência.

## 11. Fontes

Tabelas e tetos:

- [INSS — tabela de contribuição (vigente)](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal)
- [INSS — tabela de contribuição (histórico)](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal/tabela-de-contribuicao-historico)
- [Debit — tabelas INSS 1990–2026](https://www.debit.com.br/tabelas/tabelas-inss)
- [Previdenciarista — tetos previdenciários desde 1994](https://previdenciarista.com/tabela-historica-de-tetos-previdenciarios-da-previdencia-social-inss-a-partir-de-1994/)
- [VRI Consulting — tetos da contribuição previdenciária](https://www.vriconsulting.com.br/artigo.php?id=979)

Múltiplos vínculos e cálculo:

- [VRI Consulting — acumulação de empregos simultâneos](https://www.vriconsulting.com.br/artigo.php?id=460&titulo=acumulacao-de-empregos-simultaneos-calculo-da-contribuicao-previdenciaria) (origem dos exemplos usados como oráculo)
- [Migalhas — trabalhador com dois empregos pode reaver INSS pago além do teto](https://www.migalhas.com.br/depeso/435237/trabalhador-com-dois-empregos-pode-reaver-inss-pago-alem-do-teto)
- [Ingrácio — CLT e MEI ao mesmo tempo](https://ingracio.adv.br/clt-e-mei-inss-duas-vezes/)
- [Previdenciarista — MEI e complementação para 20%](https://previdenciarista.com/blog/mei-pode-ter-uma-aposentadoria-maior-que-o-salario-minimo/)

Prescrição:

- [ConJur — direito à restituição da contribuição previdenciária](https://conjur.com.br/2022-mai-17/opiniao-direito-restituicao-contribuicao-previdenciaria/)
- [Restituição de contribuições em duplicidade — professor](https://advogadojuniorfigueiredo.com.br/restituicao-contribuicoes-inss-duplicidade-professor/)

Indicadores do CNIS:

- [Cálculo Jurídico — siglas do CNIS](https://calculojuridico.com.br/siglas-cnis-inss/)
- [Barbieri — indicadores do CNIS](https://www.barbieriadvogados.com/indicadores-do-cnis/)
- [Bocchi — indicadores INSS](https://bocchiadvogados.com.br/indicadores-inss/)
