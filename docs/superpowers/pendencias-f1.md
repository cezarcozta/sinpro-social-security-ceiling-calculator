# Pendências conhecidas depois da F1

Registradas na revisão final da F1 (2026-11-18) e deliberadamente deixadas para depois.
Nenhuma bloqueia a F1; as duas primeiras seções são as que mais importam antes de o app
ir ao ar para o sindicato.

## Risco de validação: um único extrato real

O parser foi construído e validado contra **um** Extrato Previdenciário real. As defesas
atuais detectam **cabeçalho diferente** (`LAYOUT_DESCONHECIDO`, tipo de filiado
desconhecido, célula órfã). Nenhuma defesa detecta **dados diferentes sob cabeçalho
igual**.

Próximo ciclo, já decidido com o usuário: não haverá mais extratos reais, então os
cenários serão **sintetizados** por um builder de camada de texto — um helper de teste
que monta `TextItem[]` nas coordenadas reais medidas do extrato de exemplo. O extrato real
permanece como teste de geometria verdadeira. Cenários a cobrir:

1. **Dois vínculos CLT no mesmo mês**, com soma acima e abaixo do teto. É o caso central
   do produto e hoje não tem cobertura nenhuma: na única amostra, os dois vínculos CLT não
   se sobrepõem em mês nenhum (um termina em 06/2008, o outro começa em 01/2013).
   Corrigindo o registro: **há** sobreposição na amostra, descoberta na F1.5 — 06/2015 tem
   o vínculo 4 (CLT) e o 5 (prestador) ao mesmo tempo. O que não existe é sobreposição
   CLT+CLT.
2. **13º salário** (competência `13/AAAA`). O parser aceita `MM=13`, mas nenhuma fixture
   tem. O 13º tem teto isolado, então a F2 depende disso.
3. **Vínculo em aberto** (sem `Data Fim`) e **lacunas** de meses no meio do vínculo.
4. **Três vínculos simultâneos**, competência duplicada, e vínculo atravessando a quebra
   de página com grupos de colunas pela metade.

## Verificações de integridade que o próprio documento permite

- ~~**Completude por vínculo:**~~ **feito na F1.5** (`parse-cnis.test.ts`, "a contagem de
  competências bate com o intervalo de datas do vínculo" e "nenhum vínculo perde
  competências em silêncio").
- **Conferência contra "Valores Consolidados por Ano Civil":** essa seção traz o valor
  consolidado por mês, emitido pelo próprio INSS, dentro do mesmo documento. É um checksum
  nativo. Hoje a seção só é reconhecida como marcador de fim da varredura. Divergência
  deveria virar aviso alto, nunca um número silenciosamente menor.

## Produto

- **Fase de conferência na UI:** mostrar a tabela mês a mês e pedir ao professor que
  confira contra o PDF antes de usar o número; rotular o resultado como estimativa.
- **Canal de erro sem telemetria:** sem backend não há como saber que o parser falhou para
  alguém. Um botão "o resultado não bate" que gere um texto para o professor enviar ao
  sindicato — nenhum dado sai automaticamente, e o sindicato descobre layouts novos.
- **Empregado Doméstico** hoje gera aviso em vez de entrar como CLT. É segurado empregado
  do RGPS e seu salário de contribuição entra no teto, então a escolha atual falha fechada
  (avisa) em vez de subestimar em silêncio. Decisão de produto pendente.
- **"Competências lidas"** soma registros, não meses distintos: com dois vínculos no mesmo
  mês o número fica maior que a quantidade de meses. Relevante para o dashboard da F3.

## Pendências depois da F1.5

Registradas na revisão final do branch `f1.5-naturezas-vinculo` (2026-11-19). As três
primeiras são decisões que a **F2 tem que tomar**, não defeitos do parser.

### Decisões que a F2 precisa tomar

- ~~**Competência duplicada chega duplicada.**~~ **decidido na F2**: a regra é por natureza,
  em `teto/competencias.ts` — `CLT` e `CI_PRESTADOR` no mesmo vínculo ficam com a primeira
  e emitem `DUPLICADA_DESCARTADA`; `CI_PROPRIO` soma. Registro original abaixo.

- **Competência duplicada chega duplicada.** O parser registra
  `COMPETENCIA_DUPLICADA` e entrega os dois registros, por decisão documentada em
  `types.ts`: descartar perderia dinheiro quando a repetição é legítima (duas guias no
  mesmo mês no recolhimento próprio somam de verdade). A F2 tem que decidir **por
  natureza** — somar em `CI_PROPRIO`, tratar como artefato de leitura em `CLT` e
  `CI_PRESTADOR`. Se a F2 só somar, uma duplicata de tabela CLT dobra a base do mês e
  inventa crédito, que é o erro mais caro que este produto pode cometer.
- **Avisos novos que a UI precisa saber exibir**, além dos da F1: `TABELA_DESCARTADA`
  (vínculo com duas tabelas de layouts diferentes — a lista da primeira não entra no
  resultado, e o aviso diz quais competências), `CABECALHO_REAPROVEITADO` (tabela
  continuou sem repetir o cabeçalho; as colunas da página anterior foram reaproveitadas)
  e `BLOCO_PULADO` (quantas competências ficaram de fora de um bloco ilegível). Todos se
  encaixam na regra "falhar aberto" da §9 da spec da F2.
- ~~**O texto da UI mente hoje.**~~ **corrigido na F2**: o aviso agora rotula cada vínculo
  pela natureza lida (`NATUREZA_LEGIVEL`) e afirma só que as competências contam para o
  teto, sem prometer um cálculo que aquela tela não exibe. Registro original abaixo.

- **O texto da UI mente hoje.** `upload-cnis.tsx` chama todo vínculo não-CLT de
  "contribuinte individual" — mas `TIPOS_NAO_CLT` aceita Trabalhador Avulso, Segurado
  Especial e Segurado Facultativo, que `naturezaPeloTipo` rotula `CI_PROPRIO` — e afirma
  que "o cálculo de teto considera todos eles", quando o motor ainda não existe. Corrigir
  junto com a F2, que é quando a frase passa a poder ser verdadeira.

### Defeitos pequenos, deliberadamente não corrigidos

- `NATUREZA_INDEFINIDA` diz "não tem tabela de competências" mesmo quando a tabela existia
  e não foi entendida; o usuário recebe dois avisos sobre a mesma causa, o segundo
  enganoso. Distinguir "nunca vi tabela" de "vi e não entendi".
- A costura de indicador quebrado em duas linhas não exige proximidade: `ultimoPorGrupo`
  é reiniciado a cada cabeçalho de tabela, mas um token em maiúsculas que caia sozinho na
  coluna `Indicadores` páginas depois ainda cola na última competência daquele grupo.
  Exigir mesma página, ou diferença de uma linha visual.
- `gruposComDado` identifica o grupo já consumido por identidade de objeto
  (`comCompetencia.some((g) => g.celulas === celulas)`): funciona, é frágil e é O(n²).
- `let vinculo = null as EmConstrucao | null` existe só para contornar o estreitamento do
  TS diante da atribuição dentro de `fecharPendente`, e `finalizar` carrega dois
  `eslint-disable`. Um objeto-container ou devolver o vínculo de `fecharPendente()`
  resolve sem cast.
- O comentário de `ORDEM` em `layouts.ts` sugere que a ordem resolve ambiguidade entre
  layouts; na prática os conjuntos de rótulos são disjuntos e a ordem é irrelevante. A
  constante ainda duplica as chaves de `NOMES_LAYOUT` (podia ser `Object.keys`).

### Classes de entrada agora cobertas

O builder de camada de texto sintética que a F1 deixou pendente **nasceu** na F1.5, pequeno,
em `parse-cnis.test.ts` (`extratoSintetico`). Já cobre: vínculo com duas tabelas, rótulo de
seção partido pelo PDF, tabela que continua sem repetir o cabeçalho de colunas, cabeçalho
de vínculo repetido no meio da tabela e bloco pulado. **Não** cobre ainda, e continua
pendente: dois vínculos CLT no mesmo mês, 13º (`13/AAAA`), vínculo em aberto e três
vínculos simultâneos.

## Técnicas, de baixo impacto

- `vitest.config.ts` dispara aviso do Vite (ESM carregado como CommonJS). Renomear para
  `.mts` ou declarar `"type": "module"` deixa a saída de teste limpa.
- O pdf.js emite aviso sobre `standardFontDataUrl`. Verificado na revisão final: os
  defaults do pdf.js são `null`, não URLs de CDN — nenhum request externo. É só ruído.
- Download do JSON: o `<a>` não é anexado ao DOM e a URL é revogada de imediato; funciona
  no Chromium, mas Firefox e Safari podem cancelar. Anexar, clicar, remover e revogar com
  `setTimeout`.
- Soltar o PDF fora da dropzone faz o navegador abrir o arquivo e sair do app.
- Acessibilidade: `role="region"` redundante; `role="alert"` sobrescreve a semântica do
  `<ul>`; `role="status"` montado já com conteúdo pode não ser anunciado; o contorno da
  dropzone fica abaixo de 3:1 (WCAG 1.4.11) — relevante para um público mais velho.
- Sem testes para `PDF_PROTEGIDO` e `SEM_CAMADA_DE_TEXTO`, nem para o wrapper `parseCnis`.
- O check positivo de PII do `make-fixture.ts` não tem padrão para nomes, então a
  substituição de nome é a única defesa para nome e nome da mãe.
- Navegadores não verificados: Firefox, Safari. Também não verificados: leitor de tela
  real e modo escuro do sistema.

## Pendências depois da F2

Registradas no fim da execução do plano da F2 (2026-11-19). O motor vive em
`src/lib/teto/` e é biblioteca pura: sem UI, sem I/O, sem `new Date()`.

### Bloqueia o app ir ao ar

- ~~**Tabelas de 2022 a 2025 vêm de fonte secundária.**~~ **Fechado em 19/11/2026.** As sete
  vigências foram conferidas em fonte primária, valor por valor — quatro limites de faixa e
  o teto de cada uma, 35 números — contra o texto das portarias (MTP/ME 12/2022; MPS/MF
  26/2023, Anexo II; MPS/MF 27/2023, Anexo II-A; MPS/MF 2/2024; MPS/MF 6/2025) e as páginas
  oficiais do INSS (tabela histórica, para 2021; tabela vigente, para 2026). **Zero
  divergências** — a fonte secundária estava correta nos cinco anos do meio. Um teste de
  fixação em `tabelas.test.ts` pina os valores com a portaria de origem em comentário, para
  que uma edição futura não os troque em silêncio. Ao acrescentar 2027, conferir do mesmo
  modo e anotar.
- **Os disclaimers da §9 da spec da F2 são requisito da F3**, não sugestão. Cada linha
  daquela tabela é acionada por um campo da saída (`camadas[].lido`,
  `prescricao.noPrazo`, `prescricao.urgente`, `ignoradasSemTabela`, `avisos`,
  `decimoTerceiro`, `achados`), justamente para que a F3 implemente a regra em vez de
  depender de alguém lembrar.

### Avisos novos que a F3 precisa saber exibir

Além dos da F1 e da F1.5, o motor emite: `DUPLICADA_DESCARTADA` (competência repetida na
mesma tabela CLT ou de prestador — ficou a primeira), `COMPETENCIA_INVALIDA` (competência
que não casa com `MM/AAAA`, fora do cálculo), `ALIQUOTA_DIVERGENTE` (a alíquota efetiva do
recolhimento próprio não bate com o que os indicadores prometem — não entendemos a linha),
`BASE_AUSENTE` (contribuição sem salário de contribuição; a camada não entra no total) e
`PRESCRICAO_INDETERMINADA`. Todos se encaixam na regra "falhar aberto".

### Decisões do motor que a F3 herda

- **O valor do DAS do MEI não entra em `totalAPedirCentavos`** e sai em
  `achados: MEI_DAS_INDEVIDO`, porque o caminho de restituição é o Anexo I da IN RFB
  2.055/2021 no e-CAC, não o PER/DCOMP Web. Exibir os dois somados mandaria o professor
  pedir pelo rito errado.
- **A camada com `BASE_AUSENTE` fica fora do total.** Falhar aberto no aviso, fechado no
  dinheiro: afirmar que todo o valor pago é indevido, quando falta justamente o dado que
  diria quanto era devido, seria inventar crédito.
- **A §6.1 da spec omite o `min(base_i, teto)` na camada do prestador.** O motor aplica o
  `min` nas três camadas; sem isso um professor com um único vínculo de prestador acima do
  teto apareceria com crédito inexistente. Corrigir a spec quando ela for revisada.

### Fora do escopo da F2, ainda abertas

- **`IREC-LC123-SUP`** (Plano Simplificado acima da base do mínimo, cujo excesso é
  restituível) não aparece na fixture e não é tratado. Candidato a achado próprio.
- **`PSC-MEN-SM` / `PSC-MEN-SM-EC103`** (salário de contribuição abaixo do mínimo) aparecem
  na fixture, inclusive em vínculo CLT, e não são tratados. Afetam agrupamento e
  complementação, não o teto.
- **`Valores Consolidados por Ano Civil`** continua sem uso como checksum. O motor da F2 é
  o consumidor natural dessa conferência: é um valor por mês emitido pelo próprio INSS,
  dentro do mesmo documento.
- **Procedimento de restituição divergente entre fontes** (PER/DCOMP Web vs. declaração
  anual de IR). Importa para o texto da F4.
- **Cenários de parser ainda sem fixture sintética**: dois vínculos CLT no mesmo mês, 13º
  (`13/AAAA`), vínculo em aberto e três vínculos simultâneos. O motor da F2 cobre os quatro
  com literais `CnisExtrato`, mas o caminho PDF → `CnisExtrato` não.
