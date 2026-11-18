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
2. **13º salário** (competência `13/AAAA`). O parser aceita `MM=13`, mas nenhuma fixture
   tem. O 13º tem teto isolado, então a F2 depende disso.
3. **Vínculo em aberto** (sem `Data Fim`) e **lacunas** de meses no meio do vínculo.
4. **Três vínculos simultâneos**, competência duplicada, e vínculo atravessando a quebra
   de página com grupos de colunas pela metade.

## Verificações de integridade que o próprio documento permite

- **Completude por vínculo:** `dataInicio`/`dataFim` versus o número de remunerações lidas.
  Uma asserção que pega perda silenciosa de dado sem precisar prever a causa.
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
