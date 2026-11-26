# F1 — Upload e Parser de CNIS (design)

Data: 2026-11-18
Projeto: Calculadora de Teto Previdenciário
Escopo: **apenas F1**. F2 (motor de cálculo), F3 (dashboard/PWA) e F4 (declaração em PDF)
são ciclos posteriores, cada um com seu próprio spec e plano.

## Objetivo

Ler um extrato CNIS em PDF (gerado pelo portal "Meu INSS") inteiramente no navegador do
usuário e produzir um objeto estruturado com os dados do filiado e as remunerações dos
vínculos CLT, pronto para o motor de cálculo de F2.

## Decisões de escopo

| Decisão | Valor |
|---|---|
| Entregável | App Next.js + tela de upload + JSON extraído na tela |
| Blocos extraídos | Somente *Remunerações* de vínculos CLT |
| PWA (manifest/service worker) | Fora de F1 — entra em F3 |
| Dados de teste | Fixture anonimizada em texto; o PDF real fica no `.gitignore` |
| Técnica de parsing | Geométrica guiada pela linha de cabeçalho (ver §4) |

Vínculos de Contribuinte Individual / MEI ficam fora do cálculo por decisão de produto.
Assunção registrada: o teto do INSS é único por segurado, então um professor que também
recolhe como CI pode ter o teto atingido por uma via que esta versão não enxerga. O
parser por isso devolve esses vínculos em `ignorados`, para que a UI possa dizer ao
usuário o que não foi considerado.

## 1. Arquitetura

Next.js (App Router, TypeScript strict, Tailwind), construído com as skills do plugin
Vercel (`vercel:nextjs` e correlatas) e mantido deliberadamente leve: nenhuma dependência
de UI pesada, nenhum gerenciador de estado global, nenhum backend.

**Zero rotas de API.** O diretório `app/` serve apenas a página e arquivos estáticos.
`pdfjs-dist` é usado com o worker copiado para `public/`, não via CDN — isso evita
qualquer request externo no momento em que o usuário abre o extrato e mantém o app
funcional sem rede. O PDF vive como `ArrayBuffer` em estado de componente: sem
`localStorage`, sem `fetch`, sem telemetria. Testes com Vitest.

## 2. Módulos

```
src/lib/cnis/
  types.ts        tipos do domínio + códigos de erro/warning
  text-layer.ts   pdf.js -> TextItem[] {page,x,y,str}, já com a transform do viewport
  rows.ts         TextItem[] -> Row[] (cluster por y, tolerância 3pt; itens ordenados por x)
  table.ts        Row(cabeçalho) + Row[](dados) -> células por coluna; resolve 1..3 grupos
  sections.ts     Row[] -> blocos (filiado | vínculo | tabela | legenda=fim)
  parse-cnis.ts   orquestra: bytes -> ParseResult
  index.ts        API pública: parseCnis(bytes): Promise<ParseResult>
```

Cada módulo é uma função pura, compreensível e testável isoladamente. Só `text-layer.ts`
depende do `pdf.js`; todo o resto roda em teste sobre uma fixture JSON, sem browser e sem
PDF. Essa fronteira é o que mantém a suíte rápida e os módulos pequenos.

## 3. Contrato de saída

```ts
type ParseResult = { extrato: CnisExtrato; warnings: ParseWarning[] }

type CnisExtrato = {
  filiado: { nome?: string; nit?: string; cpf?: string; dataNascimento?: string; nomeMae?: string }
  geradoEm?: string
  vinculos: Vinculo[]        // só tipoFiliado === "Empregado ou Agente Público"
  ignorados: { seq: number; tipoFiliado: string; motivo: 'NAO_CLT' }[]
}

type Vinculo = {
  seq: number; nit?: string; codigoEmp?: string; origem?: string; matricula?: string
  tipoFiliado: string; dataInicio?: string; dataFim?: string; ultRemun?: string
  remuneracoes: Remuneracao[]
}

type Remuneracao = {
  competencia: string      // "MM/AAAA"; aceita MM=13 (13º salário)
  valorCentavos: number    // inteiro — F2 soma sem erro de ponto flutuante
  indicadores: string[]    // ex.: ["IREM-INDPEND"]
}
```

Três desvios conscientes do JSON de exemplo da spec em `AGENTS.md`, todos motivados pelo
PDF real:

1. `cnpj` passa a ser **`codigoEmp`, string opaca**: o vínculo 4 do extrato de exemplo
   traz `98.765.432` (código CEI/CNO), não um CNPJ. Validar como CNPJ rejeitaria dado
   legítimo.
2. `valor` passa a **`valorCentavos`** (inteiro), para que as somas de F2 sejam exatas.
3. `ignorados` é novo, pelo motivo descrito em "Decisões de escopo".

O parser não filtra janela temporal — devolve todas as competências do extrato. O corte
dos últimos 5 anos é regra de cálculo e pertence a F2.

## 4. Reconhecimento dos blocos

Achados do extrato de exemplo (5 páginas, 5 vínculos) que determinam a técnica:

- As páginas são `rotate=90`. Aplicar `Util.transform(viewport.transform, item.transform)`
  antes de qualquer coisa; sem isso a ordem dos itens no content stream é coluna-maior e
  inutilizável.
- A tabela de remunerações CLT vem em **3 grupos de colunas** por linha
  (`Competência | Remuneração | Indicadores` repetido 3x), com células vazias legítimas.
- O rótulo da seção **não** determina o layout: o vínculo 5 é Contribuinte Individual e
  também tem seção "Remunerações", mas com 7 colunas
  (`Competência | Contrat. | Estabelecimento | Tomador | Forma Prestação Serviço |
  Remuneração | Indicadores`).
- O conjunto de colunas do cabeçalho do vínculo varia (ex.: `Matrícula do Trabalhador`
  existe no vínculo 4 e não no vínculo 1).
- **A tabela continua na página seguinte sem repetir o rótulo da seção nem a linha de
  cabeçalho**: a página 3 do extrato de exemplo começa diretamente com linhas de dados do
  vínculo 4. O estado da tabela tem que atravessar a quebra de página, e as linhas de
  cabeçalho/rodapé repetidas em cada página têm que ser descartadas.
- Duas seções encerram a varredura de vínculos: **"Valores Consolidados por Ano Civil"** e
  **"Legenda de Indicadores"**.
- O rodapé legal ("O INSS poderá rever...", "O segurado somente terá...") repete em todas
  as páginas.

Achado guardado para F2: a seção "Valores Consolidados por Ano Civil" traz o valor
consolidado por mês já **limitado ao teto**, com `*` marcando as competências em que o
teto foi aplicado (2023 = 7.507,49, 2024 = 7.786,02, 2025 = 8.157,41). Serve para
conferir a tabela de tetos do motor de cálculo contra o próprio documento do INSS.

Portanto: o filtro CLT usa o campo **`Tipo Filiado no Vínculo`**, nunca o rótulo da seção;
as faixas de `x` de cada coluna são derivadas da linha de cabeçalho real encontrada no
documento, não de posições fixas; e a varredura termina na seção de legenda.

## 5. Erros e avisos — falhar de forma visível

Erros (abortam o parse, mensagem para o usuário):

| Situação | Código |
|---|---|
| Texto "CNIS - Cadastro Nacional de Informações Sociais" ausente | `NAO_E_CNIS` |
| PDF sem camada de texto (extrato escaneado ou foto) | `SEM_CAMADA_DE_TEXTO` |
| PDF protegido por senha | `PDF_PROTEGIDO` |

Avisos (parse continua, aparecem na tela):

| Situação | Código |
|---|---|
| Cabeçalho de tabela não reconhecido (bloco pulado) | `LAYOUT_DESCONHECIDO` |
| Competência sem valor, ou valor sem competência | `CELULA_ORFA` |
| Competência repetida no mesmo vínculo | `COMPETENCIA_DUPLICADA` |

Cada aviso carrega página e `seq` do vínculo. Nenhum dado é descartado em silêncio: num
cálculo de restituição, um erro visível é muito melhor que um número errado plausível.

## 6. UI de F1

Página única, mínima e explicitamente descartável quando F3 trouxer o dashboard:

- dropzone (input file + drag & drop, um PDF por vez);
- banner de privacidade: "Seu arquivo não sai do seu navegador";
- após o parse: resumo (nome do filiado, vínculos CLT, ignorados, total de competências),
  lista de avisos em destaque, `<pre>` com o JSON e botão "Baixar JSON".

## 7. Testes e dados

`scripts/make-fixture.mjs` gera `src/lib/cnis/__fixtures__/extrato-exemplo.textlayer.json`
a partir de um PDF local, substituindo nome, NIT, CPF, nome da mãe e razão social por
valores fictícios. `extrato-exemplo.pdf` entra no `.gitignore` e nunca é commitado — o
repositório é público e o arquivo contém dados pessoais reais.

Os testes de `rows.ts` até `parse-cnis.ts` rodam sobre a fixture. `text-layer.ts` tem um
smoke test que só roda se o PDF local existir.

Condições de aceite, medidas no extrato de exemplo. Os valores citados (códigos de
empregador, datas e remunerações) são os da **fixture anonimizada** (códigos fictícios,
datas deslocadas em 10 anos), não os do documento original:

- 5 vínculos detectados, 2 devolvidos em `vinculos`, 3 em `ignorados`;
- vínculo 1: `codigoEmp` = `12.345.678/0001-95`, 16 competências de `03/2007` a `06/2008`,
  com `03/2007` = 366,67, `12/2007` = 1.478,15 e `06/2008` = 658,58;
- vínculo 4: `codigoEmp` = `98.765.432`, 30 competências de `01/2013` a `06/2015`,
  com `06/2013` = 10.428,53;
- nenhum aviso para esse extrato.

## Riscos conhecidos

- O extrato de exemplo não contém competência `13/AAAA`. O parser aceita `MM=13`, mas o
  comportamento do 13º no CNIS não tem cobertura de fixture — resolver em F2, quando a
  regra do teto isolado do 13º for implementada.
- Há um único extrato real disponível. Layouts de outras emissões do "Meu INSS" podem
  diferir; é para isso que existe `LAYOUT_DESCONHECIDO`.
