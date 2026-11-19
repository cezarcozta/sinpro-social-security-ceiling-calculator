# F3 — Dashboard de Resultados (design)

Data: 2026-11-19. Antecessores: `2026-11-18-f1-parser-cnis-design.md`,
`2026-11-18-f2-motor-teto-design.md` (cuja §9 é **requisito** deste ciclo).

Cobre **um ciclo de entrega**: a F3. A F4 (geração da carta) é o ciclo seguinte e aparece
aqui só como destino dos botões.

## 1. Objetivo e o porquê

A F2 entregou o `ResultadoTeto`: biblioteca pura, 168 testes, nenhuma tela. Hoje o app
mostra o JSON do parser num `<pre>`. A F3 transforma aquele objeto em duas telas que um
professor de 55 anos, no celular, entre duas aulas, consegue usar sem ajuda.

O porquê não é "visualizar dados". É **levar o professor a uma ação**. A pesquisa feita
na abertura deste ciclo mostrou que a saída do motor sustenta **dois** resultados
diferentes, com ritos, destinatários e prazos diferentes:

| | Parar a sangria | Reaver o passado |
|---|---|---|
| O que é | declaração de múltiplos vínculos ao RH | pedido de restituição |
| Base | IN RFB 2.110/2022, art. 36 e Anexo VIII | PER/DCOMP Web, no e-CAC |
| Efeito | meses **futuros** — nada do passado | meses passados, mês a mês |
| Destinatário | a escola que desconta por último | Receita Federal |
| Prazo | o próximo salário | 5 anos por pagamento |
| Custo p/ o professor | entregar um papel | processo por competência |

**A declaração é prospectiva.** Ela não devolve um centavo do que já foi descontado. O
risco número um desta tela é o professor sair dela acreditando que a carta ao RH recupera
o passado — a pesquisa de UX apontou "próximo passo ambíguo" como o que mais travou
usuários em páginas de resultado da mesma forma (elegibilidade + dinheiro + o que fazer).

Decisão de produto, tomada por Cesar em 19/11/2026: a tela **lidera pela sangria**. É a
ação mais barata (entregar um papel), a que o sindicato apoia sem advogado, e a de valor
recorrente. A restituição vem abaixo, como o que já se perdeu.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Veredito em uma tela, com os dois resultados separados e cada um com seu próximo passo.
2. Conferência mês a mês, agrupada por ano, onde o professor confere contra o PDF.
3. Os onze disclaimers da §9 da F2 implementados como **regra estrutural**, não como
   lembrete — cada um acionado pelo campo que o motor devolve de propósito.
4. Caminho pronto para a F4: a conferência produz exatamente a entrada do Anexo VIII.

**Non-goals**

- Gerar o PDF da declaração. É a F4. Aqui o botão leva ao estado seguinte, que ainda não
  existe; na F3 ele fica desabilitado com o motivo visível.
- Backend, persistência, banco, telemetria. Nada sai do navegador (F1).
- Biblioteca de gráfico. A `AGENTS.md` §F3 pede "um gráfico **ou** tabela expansível" —
  a tabela expansível por ano cumpre o requisito, e um gráfico de barras por ano é
  derivável depois sem mudar nada da arquitetura.
- Rotas, URL com estado, deep link (ver §5.1).
- Checksum contra "Valores Consolidados por Ano Civil" — pendência aberta desde a F1,
  consumidor natural é o motor, não a tela.

**Anti-goals** (o que torna isto um fracasso mesmo funcionando)

- **Um número sozinho.** Qualquer valor em dinheiro sem natureza (estimado / lido / exato)
  e sem elegibilidade (no prazo / prescrito) ao lado.
- **Onze faixas de aviso.** A pesquisa é explícita: mais explicação aumentou a carga
  cognitiva e piorou a página. Cumprir a §9 empilhando banners é cumpri-la no código e
  descumpri-la na cabeça do professor.
- **Sugerir que a carta ao RH devolve o passado.**
- Deixar o professor em "você pagou a mais" sem dizer o que fazer em seguida.
- Esconder aviso, competência não avaliada ou camada incompleta para a tela ficar limpa.

## 3. Constraints

- Tudo client-side, `'use client'`. Nenhum dado de extrato trafega.
- Dinheiro é centavos inteiros até a borda da tela; a conversão para reais acontece em um
  único lugar (§5.3). Nenhum `parseFloat`, `toFixed`, `/100` fora dele.
- O motor é puro e não chama `new Date()`. `dataReferencia` é injetada pela tela (§5.4).
- Público mais velho, majoritariamente no celular. Mobile-first, corpo de texto ≥ 16px,
  contraste de borda ≥ 3:1 (WCAG 1.4.11 — a dropzone da F1 falha hoje e entra na conta),
  nunca cor como único portador de significado.
- Stack existente: Next.js 16.4.6 (App Router), React 19.3.1, Tailwind 4.3.5, Vitest 5.
  Sem biblioteca de componentes.

## 4. Approaches considerados

As três formas diferem em **onde fica o portão** — o momento em que se exige conferência.

### 4.1 Veredito primeiro; portão no documento, não no número — **escolhida**

O professor cai no veredito assim que o PDF é lido. A conferência existe como passo real,
mas só é **obrigatória** para gerar a carta da F4.

Razão: um número errado na tela não faz dano — não sai do navegador. O dano é um número
errado assinado e entregue no RH, ou um pedido no e-CAC que não se sustenta. O portão
pertence ao documento. De graça, isso resolve o que a pesquisa apontou: a conferência
deixa de ser lição de casa sem recompensa e passa a ser o caminho para a ação que o
professor já quer.

### 4.2 Conferência primeiro, veredito só depois — descartada

Leitura mais literal de "nunca um número sozinho": ninguém vê número antes de confirmar
mês a mês. Mas é um muro de trabalho antes de qualquer recompensa, para quem subiu o
arquivo justamente para não fazer conta. Abandono no meio entrega nem veredito nem
conferência.

### 4.3 Abas sobre o mesmo resultado — descartada

Veredito e conferência como vistas simultâneas. Conferência é um **ato**, não uma vista:
numa aba parece opcional, as duas telas competem por atenção em vez de se encadearem, e o
portão desaparece.

## 5. Arquitetura

### 5.1 Estado na página, sem rota e sem storage

Uma máquina de estados em React, no cliente:

```
inicial → lendo → (erro) 
                → veredito ⇄ conferencia → [F4: carta]
```

Rotas `/resultado` e `/conferencia` seriam mais bonitas e dariam botão-voltar, mas exigem
o `ResultadoTeto` atravessando navegação: ou `sessionStorage` — PII fora da memória
volátil, contra o princípio que fez o professor subir o arquivo — ou um Context que se
perde no refresh, e aí a rota mente. **Escolha: estado em memória, sem URL.** Refresh
volta ao início, como hoje. A F4 entra como o estado seguinte.

### 5.2 Camada de apresentação pura, fora dos componentes

Mesma disciplina da F2: derivação em módulos puros e testados, componentes só desenham.

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/apresentacao/dinheiro.ts` | centavos → string em reais pt-BR. Único lugar com fração. |
| `src/lib/apresentacao/anos.ts` | `ResultadoTeto` → `[{ ano, meses, totais, acimaDoTeto, prescritos }]`. O `porAno` que a §2.2 da F2 deixou de propósito para a tela. |
| `src/lib/apresentacao/veredito.ts` | deriva os dois resultados do §1: a sangria atual e o acumulado. Regras em §6. |
| `src/lib/apresentacao/avisos.ts` | código de aviso → frase em português (§6.5). |
| `src/lib/apresentacao/types.ts` | tipos da camada |

Nenhum deles importa React. Um `.test.ts` por módulo.

### 5.3 O componente `Dinheiro` é o que torna a §9 estrutural

```tsx
type Natureza = 'estimado' | 'lido' | 'exato';
type Elegibilidade = 'noPrazo' | 'prescrito' | 'naoSeAplica';

function Dinheiro(props: {
  centavos: number;
  natureza: Natureza;          // obrigatório
  elegibilidade: Elegibilidade; // obrigatório
}): ReactNode
```

As três props são obrigatórias: **não dá para renderizar dinheiro sem dizer o que ele é.**
O rótulo sai colado no número (`estimado`, `lido do extrato`, `exato`, `prescrito`), em
texto, não só em cor.

Para que ninguém contorne o componente, `formatarCentavos` fica cercado por
`no-restricted-imports` no `eslint.config.mjs`: só `components/dinheiro.tsx` pode
importá-lo. Mais um teste de conformidade (§7) que renderiza o veredito com cada gatilho
da §9 ligado e falha se a frase correspondente não aparecer.

Mapeamento `natureza`:

| Campo do motor | natureza |
|---|---|
| `baseExcedenteCentavos`, `somaBaseCentavos`, `tetoCentavos` | `exato` |
| valor de camada com `lido === false` (CLT, prestador) | `estimado` |
| valor de camada com `lido === true` (recolhimento próprio) | `lido` |
| `retidoAMaiorCentavos`, `totalAPedirCentavos`, `totalPrescritoCentavos` | `estimado` (compostos por camadas estimadas) |
| `achados[].valorCentavos` (DAS do MEI) | `lido` |

### 5.4 `dataReferencia`

A tela chama `new Date()` **uma vez**, no instante do cálculo, e formata em `AAAA-MM-DD`
local (não UTC — às 21h de São Paulo o UTC já é o dia seguinte, e prescrição se decide no
dia). O motor segue puro. Em teste, a data é injetada.

### 5.5 Tema

O app fixa **tema claro**: `color-scheme: light` no `:root`. Hoje `globals.css` declara
variáveis para `prefers-color-scheme: dark` enquanto `page.tsx` fixa `bg-white
text-neutral-900` — o resultado, num celular em modo escuro, é controle de formulário
(radio, checkbox) renderizado escuro sobre cartão branco. A F3 introduz exatamente esses
controles, então a inconsistência passa a ser visível. Tema escuro de verdade fica como
pendência, declarada.

### 5.6 O que acontece com a tela de hoje

`upload-cnis.tsx` mostra hoje cinco coisas além da dropzone. Destino de cada uma:

| Hoje | Na F3 |
|---|---|
| dump do JSON num `<pre>` | **sai** — é o que a F3 existe para substituir |
| botão "Baixar JSON" | **sai**, decidido por Cesar em 19/11/2026: o arquivo é o extrato inteiro — nome, CPF, NIT, todos os vínculos — e um clique produz PII guardável e encaminhável sem o professor perceber. A conferência mês a mês passa a ser a forma de verificar o que foi lido. |
| aviso de vínculos não-CLT | **migra** para o bloco de avisos do veredito; a frase deixa de ser "as competências deles também contam" e passa a apontar as camadas, que agora existem na tela |
| "Pendências indicadas pelo INSS" (`PREM-EXT`, `IRE-INSS`, …) | **migra** para o mesmo bloco, mantida como está: são indicadores do próprio INSS, não códigos nossos, e a `AGENTS.md` §F1 os pede explicitamente. Sem dicionário de tradução neste ciclo — exibidos como o INSS os escreve, sob a frase "o INSS marcou pendência nestes vínculos" |
| `warnings` do parser, com página e vínculo | **migra** e se **une** aos `avisos` do motor num bloco único no topo do veredito, com as frases da §6.5 |

O bloco de avisos é portanto **um só**, com três origens (parser, motor, indicadores do
INSS), ordenado por gravidade e não por origem. Duas listas de aviso em telas diferentes
era o caminho para o professor não ler nenhuma.

## 6. Regras de derivação

### 6.1 A sangria atual — "você está pagando a mais agora"

`ultimaCompetencia` = a maior competência **não-13º** presente em `competencias`,
ordenada por `AAAA` e depois `MM` (a ordem do motor não é presumida; a camada ordena).

- Se ela tem `retidoAMaiorCentavos > 0` → bloco da sangria, **com o mês nomeado**:
  "no último mês do seu extrato (09/2026) você pagou R$ 118,42 a mais", seguido de
  "se sua situação não mudou, isso se repete todo mês".
- Se ela é zero mas há mês com excesso nos 12 meses anteriores → bloco em tom menor:
  "você já passou do teto recentemente, mas não no último mês lido", com link para a
  conferência. **Nenhuma afirmação sobre o presente.**
- Se nunca houve excesso → veredito limpo, e o caminho da F4 não aparece (a `AGENTS.md`
  §F4 já condiciona a declaração a quem atinge o teto). Avisos, competências não
  avaliadas e a linha de privacidade continuam.

**Proibido extrapolar.** Média ou mediana dos últimos meses foi considerada e descartada:
inventa um número que não está no extrato, e a §9 manda o contrário ("nunca um número
sozinho"). Um mês real, nomeado, é a forma honesta.

O 13º nunca entra na sangria atual: não é salário mensal e tem teto próprio.

Se o professor marcar o último mês como **"não bate"** (§6.4), a cifra da sangria é
substituída pela divergência e pelo caminho do sindicato. Mesma razão do total a pedir:
não afirmar o que ele acabou de negar.

**Defasagem do CNIS.** O extrato atrasa. Se `ultimaCompetencia` for mais de 4 meses
anterior a `dataReferencia`, o bloco acrescenta: "seu extrato vai até MM/AAAA; se você
mudou de escola depois disso, confira antes de usar". O número continua sendo o do mês
lido — a tela só deixa de insinuar que ele vale hoje.

### 6.2 O acumulado — "você já pagou a mais antes"

Vem do `resumo` do motor, com os dois totais **sempre separados**, nunca somados:
`totalAPedirCentavos` (só `noPrazo`) e `totalPrescritoCentavos`. O prescrito aparece em
peso visual menor, rotulado "fora do pedido".

`prescricao.urgente` (≤ 90 dias) é promovido para o veredito como contagem: "3 meses
prescrevem em menos de 90 dias". É o que transforma triagem em ação, e justifica puxar
para o topo um dado que de outro modo ficaria enterrado na tabela.

**Próximo passo deste bloco: o sindicato.** Decidido por Cesar em 19/11/2026. A tela
nomeia o rito em uma frase — "pedido mês a mês no PER/DCOMP Web, no e-CAC" — e encaminha
ao Sinpro-ABC, com contato visível. Ela **não** ensina o rito: um professor sozinho no
PER/DCOMP erra o pedido, o sindicato é quem absorve o erro, e tutorial de sistema da
Receita envelhece sem ninguém do projeto perceber. O contato fica numa **constante única**,
`src/lib/apresentacao/sindicato.ts`, com valor de espera documentado, para ser trocado sem
caçar pelo código.

### 6.3 O achado do MEI

`achados[].tipo === 'MEI_DAS_INDEVIDO'` sai em cartão próprio, **fora dos dois totais**,
dizendo que o rito é outro: Anexo I da IN RFB 2.055/2021, processo no e-CAC, não
PER/DCOMP Web. Somar os dois mandaria o professor pedir pelo rito errado.

### 6.4 A conferência e o que "não bate" faz

Cartão por ano (fechado por padrão; o ano da `ultimaCompetencia` abre), uma linha por
competência, com as camadas aninhadas e cada valor pelo `Dinheiro` da §5.3. Por linha, um
par de radio: **"bate com meu PDF" / "não bate"**.

O estado da conferência vive em memória, como o resto — refresh perde, igual ao extrato:
`Record<competencia, 'bate' | 'naoBate'>`, e ausência significa sem marca.

**Estado inicial e o que conta no total** (minha decisão, decorrente da Forma 1): o mês
**sem marca conta normalmente**. Só "não bate" exclui. O total **não** começa em zero e
sobe conforme o professor confere — isso seria a Forma 2 por outro caminho, e o veredito
existe justamente para dar o número antes do trabalho.

Todas as competências têm o par de radio, inclusive as prescritas e o 13º (que é
competência própria, em linha própria). Marcar "não bate" num mês prescrito não mexe no
total a pedir — ele nunca esteve lá — mas desconta do total prescrito exibido e move a
linha para a lista de "conferir com o sindicato".

**Fonte da verdade dos totais.** `veredito.ts` **recompõe** os totais somando
`retidoAMaiorCentavos` das competências, filtrando por `prescricao.noPrazo` e pela marca,
em vez de subtrair do `resumo` do motor. Um teste de invariante afirma que, sem nenhuma
marca "não bate", o recomposto é **idêntico** a `resumo.totalAPedirCentavos` e a
`resumo.totalPrescritoCentavos`. Se um dia divergirem (arredondamento, 13º, MEI), o teste
quebra — em vez de a tela exibir um número que o motor não assina.

Um mês marcado **"não bate"**:

- sai do `totalAPedirCentavos` exibido, que passa a mostrar "a pedir, pelos meses que você
  confirmou", com o excluído listado à parte como "conferir com o sindicato";
- não entra na carta da F4;
- abre um bloco de texto pronto para o professor **copiar e enviar ao sindicato** por
  conta própria (nada é enviado automaticamente — é a pendência "canal de erro sem
  telemetria" da F1, na sua forma mínima). **Conteúdo, decidido por Cesar em 19/11/2026:**
  a competência, os valores que o motor leu por empregador e o total que ele calculou —
  **sem nome, sem CPF, sem NIT**. Não é a opção mais restritiva possível (essa seria só "o
  mês tal não bate"), e sim a mais protetiva que ainda permite ao sindicato descobrir um
  layout de extrato novo. O próprio texto afirma, dentro dele, que não contém dados de
  identificação — para o professor saber o que está colando.

A razão de excluir do total: o professor acabou de dizer que nossa leitura está errada
naquele mês. Manter o número no total é afirmar o que ele nega. Falhar aberto no aviso,
fechado no dinheiro — a mesma regra que o motor usa em `BASE_AUSENTE`.

### 6.5 Avisos em português

Os códigos vêm de três camadas: F1/F1.5 (`ParseWarning.codigo: WarningCode`, união) e F2
(`AvisoTeto.codigo: string`, hoje **não** é união). A F3 precisa de doze frases:
`LAYOUT_DESCONHECIDO`, `CELULA_ORFA`, `COMPETENCIA_DUPLICADA`, `NATUREZA_INDEFINIDA`,
`TABELA_DESCARTADA`, `CABECALHO_REAPROVEITADO`, `BLOCO_PULADO`, `DUPLICADA_DESCARTADA`,
`COMPETENCIA_INVALIDA`, `ALIQUOTA_DIVERGENTE`, `BASE_AUSENTE`, `PRESCRICAO_INDETERMINADA`.

Duas decisões:

- **Estreitar `AvisoTeto.codigo` para uma união** em `src/lib/teto/types.ts` (mudança de
  uma linha, sem efeito em runtime). Com isso o dicionário é `Record<Codigo, string>` e um
  código novo **não compila** sem frase — a mesma garantia que a F1 já tem.
- **Fallback mesmo assim**: código desconhecido exibe o código cru com frase genérica
  ("houve uma linha do extrato que não entendemos"). Nunca silêncio, nem tela em branco.

### 6.6 Lista para o e-CAC

A conferência imprime: uma folha de estilo `@media print` que esconde navegação e
controles e deixa a tabela mês a mês legível, para o professor levar ao e-CAC ou ao
sindicato. Sem biblioteca de PDF — "salvar como PDF" é do navegador. É o item de menor
prioridade do ciclo; se algo cair, cai este.

## 7. A tabela da §9, linha por linha, e onde cada uma vive

Cada linha da §9 da spec da F2 vira um lugar concreto nesta tela. Esta tabela é a lista de
verificação do plano.

| Gatilho na saída | Onde aparece na F3 |
|---|---|
| `camadas[].lido === false` | rótulo `estimado` colado em cada valor da camada, via `Dinheiro` |
| `camadas[].lido === true` | rótulo `lido do extrato`, visualmente distinto do anterior |
| `baseExcedenteCentavos > 0` | na linha do mês e no resumo, a base excedente marcada `exato`, separada do dinheiro estimado |
| `prescricao.noPrazo === false` | linha em peso menor com a data de prescrição e "fora do pedido"; total prescrito separado no veredito |
| `prescricao.urgente === true` | destaque na linha **e** contagem promovida ao veredito (§6.2) |
| `achados[].tipo === 'MEI_DAS_INDEVIDO'` | cartão próprio fora dos totais, com o rito do Anexo I da IN 2.055/2021 |
| `ignoradasSemTabela.length > 0` | lista visível no fim da conferência: "não avaliadas, fora do período coberto" |
| `avisos.length > 0` | aviso no topo do veredito, com contagem e as frases da §6.5 — não escondido em detalhe |
| `decimoTerceiro === true` | linha do 13º rotulada "teto próprio, calculado em separado de dezembro" |
| sempre | rodapé permanente: triagem, não cálculo oficial nem parecer; confira com o sindicato antes de levar ao RH |
| sempre | rodapé permanente: nada do extrato sai do navegador |

Os onze cabem em quatro lugares: **colado no número** (quatro primeiras), **promovido ao
veredito** (urgente, avisos, MEI), **lista no fim da conferência** (não avaliadas) e
**rodapé permanente** (duas). Nenhuma faixa amarela nova além da de avisos, que já existe.

## 8. Testes

- Um `.test.ts` por módulo de `apresentacao/`, com literais `ResultadoTeto` — sem PDF,
  sem camada de texto, como a F2.
- Casos de `veredito.ts`: último mês com excesso; último mês zero com excesso recente;
  nunca houve excesso; só 13º no fim do extrato; extrato defasado > 4 meses; competência
  única; `competencias` fora de ordem.
- Casos de `anos.ts`: ano só com meses prescritos; 13º junto de dezembro no mesmo cartão
  sem somar; ano sem nenhum mês acima do teto.
- `dinheiro.ts`: zero, um centavo, milhar, negativo (não deve ocorrer — teste fixa que
  lança ou formata explicitamente), `Number.isInteger` na entrada.
- **Teste de conformidade da §9**: renderiza as duas telas com um `ResultadoTeto` que liga
  cada gatilho da tabela do §7 e afirma que a frase correspondente está no documento.
  É o que faz a §9 ser requisito verificado, e não comentário.
- Isso exige renderizar componente, o que o projeto ainda não faz. **Decisão: pagar esse
  custo**, e pagá-lo pelo caminho que o próprio Next prescreve. Os docs da versão instalada
  (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`, Next 16.4.6) indicam
  Vitest com React Testing Library e jsdom — é o que o projeto já usa, mais três
  dependências de teste:

  | Dependência | Por quê |
  |---|---|
  | `@vitejs/plugin-react` | sem ele o JSX dos `.test.tsx` não é transformado. Os docs listam; eu havia omitido |
  | `@testing-library/react` + `@testing-library/dom` | renderizar e consultar por papel acessível (`getByRole`), o que faz o teste cobrar acessibilidade de passagem |
  | `jsdom` | ambiente de DOM |

  `vite-tsconfig-paths`, que os docs também listam, **não** entra: o `vitest.config.ts`
  já resolve o alias `@/` à mão e funciona.

  **Dois ambientes, sem configuração nova:** os 168 testes da F1 e F2 são puros e seguem
  em `environment: 'node'`, que é mais rápido. Os testes de componente declaram
  `// @vitest-environment jsdom` no topo do arquivo, em vez de criar `projects` no
  config. O `include` passa a aceitar `.test.tsx`.

  Oportunidade de passagem: os docs nomeiam o arquivo `vitest.config.mts`. Renomear fecha
  a pendência técnica da F1 ("`vitest.config.ts` dispara aviso do Vite, ESM carregado
  como CommonJS") — uma linha, saída de teste limpa.

  `@testing-library/jest-dom` **não** entra: os matchers do próprio Vitest bastam, e os
  docs do Next não o pedem.

- A alternativa sem dependência nova (`renderToString` do `react-dom/server`) foi
  considerada e descartada: não exercita os radio da conferência, que é justamente a
  interação que muda número na tela.
- Acessibilidade verificada à mão nesta entrega: navegação por teclado nos radio da
  conferência e nos acordeões de ano, e contraste de borda ≥ 3:1 (inclui corrigir a
  dropzone da F1).

## 9. O que fica para o builder

Decisões que um bom builder toma sozinho, sem voltar aqui:

- Nomes de arquivo e de componente dentro de `src/components/`, e se o veredito e a
  conferência são um componente cada ou alguns menores.
- A paleta exata, desde que o contraste passe e cor não seja o único sinal.
- A mecânica do acordeão (`<details>` nativo ou estado em React) — `<details>` é a opção
  acessível de graça e é a que eu usaria.
- O texto final de cada frase de aviso da §6.5, desde que diga o que aconteceu e o que
  isso faz com o resultado, sem jargão de parser.
- Ordem de implementação. Sugestão: `apresentacao/` com testes, depois veredito, depois
  conferência, e a folha de impressão por último.

## 10. Pendências que este ciclo abre ou herda

- **O botão da F4 fica desabilitado** com o motivo visível — "a declaração para o RH é o
  próximo passo do projeto e ainda não está pronta". É o único lugar da tela que promete
  algo que ainda não existe, e é deliberado: o professor precisa ver que o caminho existe.
  Nesta entrega o botão **não** depende de conferência nenhuma: o portão da §4.1 só começa
  a valer quando houver documento para portar, e definir agora o que conta como
  "conferido" para a carta seria decidir pela F4 antes de saber de que meses ela fala.
- **Tema escuro** declarado fora de escopo (§5.5), com `color-scheme: light` fixando o
  comportamento em vez de deixá-lo meio-implementado.
- **Gráfico por ano** derivável da saída de `anos.ts` sem mudar arquitetura.
- **Checksum contra "Valores Consolidados por Ano Civil"** (F1) segue aberto, e seria a
  conferência automática que tornaria o radio "bate/não bate" menos necessário.
- **Navegadores e leitor de tela reais** continuam não verificados (Firefox, Safari,
  leitor de tela) — pendência da F1 que a F3 amplia, porque introduz formulário.
- A F4 precisará de dado que o CNIS **não tem**: CNPJ e razão social do destinatário,
  remuneração atual por empregador e a **ordem** dos descontos (Anexo VIII,
  IN RFB 2.110/2022, art. 36 §1º). A conferência da F3 é onde esses campos naturalmente
  entram, e o desenho dela deixa espaço para isso sem prometer nada agora.

## 11. Fontes da pesquisa deste ciclo

- [IN RFB 2.110/2022, Anexos II a VIII](https://www.normaslegais.com.br/legislacao/anexos-II-VIII-in-rfb-2110-2022.htm) — forma e campos do Anexo VIII (segurado, destinatário, tabela `ORDEM | CNPJ/CPF | CATEGORIA | REMUNERAÇÃO`, a pergunta sim/não sobre o teto, assinatura)
- [IN RFB 2.110/2022, texto consolidado](https://www.legisweb.com.br/legislacao/?id=437340) — art. 36 e a remissão do art. 11
- [TOTVS — Múltiplos Vínculos](https://espacolegislacao.totvs.com/multiplos-vinculos/) — §§1º a 3º do art. 36: ordem dos descontos, validade plurianual da declaração, guarda de cópia
- [Mixvale — trabalhador com dois empregos](https://www.mixvale.com.br/2026/09/24/trabalhador-com-dois-empregos-como-evitar-desconto-excessivo-de-inss/) — PER/DCOMP Web no e-CAC como rito do passado
- [Terra — médicos com múltiplos vínculos](https://www.terra.com.br/noticias/medicos-com-multiplos-vinculos-podem-ter-inss-a-restituir,0ab5e65af06f025b58d6c6b2bc8ba42frf7nn7ru.html) — pedido mês a mês, prazo contado de cada retenção
- [DfE — design history da página de resultados de apoio a creche](https://design-histories.education.gov.uk/accessing-childcare-support/initial-design-and-testing-of-the-results-page) — cartões por unidade contra tabela única; resumo no topo; "próximo passo ambíguo" como principal travamento; itens inelegíveis dividindo opinião; mais explicação aumentando carga cognitiva
- [ONS — showing uncertainty](https://service-manual.ons.gov.uk/data-visualisation/guidance/showing-uncertainty-in-charts) — consultado; trata de gráfico, não de página de resultado, e não foi usado
