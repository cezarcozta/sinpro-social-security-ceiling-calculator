# F3 — Dashboard de Resultados: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** transformar o `ResultadoTeto` da F2 em duas telas — veredito e conferência — com os onze disclaimers da §9 implementados como regra estrutural, não como lembrete.

**Architecture:** camada de apresentação **pura** em `src/lib/apresentacao/` (deriva, agrupa, formata, nunca importa React), componentes em `src/components/` que só desenham, e uma máquina de estados em memória no cliente (sem rota, sem storage, porque o `ResultadoTeto` é PII). O componente `Dinheiro` tem props obrigatórias de natureza e elegibilidade: não é possível renderizar dinheiro sem dizer o que ele é.

**Tech Stack:** Next.js 16.4.6 (App Router), React 19.3.1, Tailwind 4.3.5, TypeScript, Vitest 5.1.1 + React Testing Library + jsdom (caminho prescrito por `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`).

**Spec:** `docs/superpowers/specs/2026-11-19-f3-dashboard-design.md` — e a §9 de `docs/superpowers/specs/2026-11-18-f2-motor-teto-design.md`, que é requisito deste ciclo.

## Global Constraints

- **Branch:** trabalhar em `f3-dashboard`, criada a partir de `main`. Nunca commitar em `main`.
- **Dinheiro é centavos inteiros** até a borda da tela. Proibido `parseFloat`, `toFixed`, `Number(x) / 100` em `src/lib/apresentacao/` e em `src/components/`, exceto dentro de `formatarCentavos`.
- **Nada sai do navegador.** Nenhum `fetch`, nenhuma telemetria, nenhum `localStorage`/`sessionStorage`, nenhum arquivo gerado com PII.
- **`new Date()` só em `upload-cnis.tsx`**, uma vez, no instante do cálculo. Toda a camada pura recebe data injetada.
- **Nenhum módulo de `src/lib/apresentacao/` importa React.**
- Corpo de texto ≥ 16px; contraste de borda ≥ 3:1; cor nunca é o único portador de significado.
- Tema claro fixo: `color-scheme: light` no `:root`.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Todos os textos de interface em português do Brasil.

## Review Focus

Classes de entrada que a spec implica e que nenhuma tarefa exercitaria por conta própria. Cada linha tem o teste anexado à tarefa que possui o código.

1. **Extrato sem nenhuma competência avaliável** (`competencias: []`): a tela não pode mostrar `NaN`, "R$ 0,00 a pedir" como se fosse veredito limpo, nem dividir por zero. → Task 4.
2. **Todas as competências fora do período coberto** (`competencias: []` com `ignoradasSemTabela` cheio): "não encontramos mês acima do teto" seria mentira — nada foi avaliado. → Task 4.
3. **Código de aviso desconhecido** (motor novo, tela antiga): precisa exibir o código cru com frase genérica, nunca sumir nem quebrar a renderização. → Task 2.
4. **`dataReferencia` fora de faixa** (relógio do dispositivo adiantado ou atrasado anos): `diasRestantes` absurdo não pode virar "prescreve em -4000 dias" nem esconder meses válidos. → Task 4.
5. **Valor muito grande e nome de empregador muito longo** no celular (360px): o número não pode quebrar em duas linhas no meio nem estourar o cartão. → Task 8.

---

### Task 1: `formatarCentavos`

**Files:**
- Create: `src/lib/apresentacao/dinheiro.ts`
- Test: `src/lib/apresentacao/dinheiro.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `formatarCentavos(centavos: number): string` — único lugar do projeto onde dinheiro deixa de ser inteiro.

- [ ] **Step 1: Criar a branch**

```bash
git switch -c f3-dashboard
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { formatarCentavos } from './dinheiro';

describe('formatarCentavos', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatarCentavos(0)).toBe('R$ 0,00');
    expect(formatarCentavos(1)).toBe('R$ 0,01');
    expect(formatarCentavos(5878)).toBe('R$ 58,78');
    expect(formatarCentavos(284119)).toBe('R$ 2.841,19');
    expect(formatarCentavos(100000000)).toBe('R$ 1.000.000,00');
  });

  it('formata negativo com sinal, em vez de quebrar a tela', () => {
    expect(formatarCentavos(-5878)).toBe('-R$ 58,78');
  });

  it('lança em entrada não inteira, que é erro de programação', () => {
    expect(() => formatarCentavos(58.78)).toThrow(RangeError);
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `npx vitest run src/lib/apresentacao/dinheiro.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar `formatarCentavos(centavos: number): string` em `src/lib/apresentacao/dinheiro.ts`**

Separar sinal, parte inteira e centavos por aritmética de inteiros (`Math.abs`, `/ 100` só depois de `Math.trunc`, ou manipulação de string), agrupar milhar com ponto e separar centavos com vírgula. **Não** usar `Intl.NumberFormat` com valor fracionário: a espessura do espaço após `R$` varia entre runtimes (` ` vs espaço comum) e o teste acima fixa espaço comum. `RangeError` quando `!Number.isInteger(centavos)`.

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run src/lib/apresentacao/dinheiro.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apresentacao/dinheiro.ts src/lib/apresentacao/dinheiro.test.ts
git commit -m "feat(f3): formatar centavos em reais, num unico lugar"
```

---

### Task 2: avisos em português, com código desconhecido coberto

**Files:**
- Create: `src/lib/apresentacao/avisos.ts`, `src/lib/apresentacao/avisos.test.ts`
- Modify: `src/lib/teto/types.ts:30` (estreitar `AvisoTeto.codigo` para união)

**Interfaces:**
- Consumes: `ParseResult` e `ParseWarning` de `@/lib/cnis`, `ResultadoTeto` e `AvisoTeto` de `@/lib/teto`.
- Produces:
```ts
export type CodigoAvisoTeto =
  | 'DUPLICADA_DESCARTADA' | 'COMPETENCIA_INVALIDA' | 'ALIQUOTA_DIVERGENTE'
  | 'BASE_AUSENTE' | 'PRESCRICAO_INDETERMINADA';          // em src/lib/teto/types.ts
export type AvisoExibivel = {
  codigo: string;
  frase: string;                       // o que aconteceu, em português, sem jargão de parser
  detalhe: string;                     // o `detalhe` da origem, cru
  gravidade: 'alta' | 'media';
  origem: 'parser' | 'motor' | 'inss';
};
export function avisosExibiveis(parse: ParseResult, teto: ResultadoTeto): AvisoExibivel[];
```
  Ordenação: `alta` antes de `media`; dentro da mesma gravidade, a ordem de entrada.

**Gravidade por código** (pinada aqui para ninguém adivinhar):

| alta — dado perdido ou número afetado | media — leitura apoiada, pede conferência |
|---|---|
| `LAYOUT_DESCONHECIDO`, `NATUREZA_INDEFINIDA`, `TABELA_DESCARTADA`, `BLOCO_PULADO`, `DUPLICADA_DESCARTADA`, `COMPETENCIA_INVALIDA`, `BASE_AUSENTE` | `CELULA_ORFA`, `CABECALHO_REAPROVEITADO`, `COMPETENCIA_DUPLICADA`, `ALIQUOTA_DIVERGENTE`, `PRESCRICAO_INDETERMINADA` |

Indicadores de vínculo do INSS (`v.indicadores`, ex. `PREM-EXT`, `IREM-INDPEND`) entram como um único `AvisoExibivel` de `origem: 'inss'`, gravidade `media`, com os códigos como o INSS os escreve — sem dicionário de tradução neste ciclo.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('traduz os doze códigos conhecidos, cada um com frase própria', () => {
  // percorre CODIGOS_CONHECIDOS e afirma frase não vazia, distinta e sem o próprio código cru
});

it('ordena gravidade alta antes de media', () => { /* BLOCO_PULADO antes de CELULA_ORFA */ });

it('código desconhecido vira frase genérica, com o código visível', () => {
  const teto = { ...vazio, avisos: [{ codigo: 'FUTURO_X', competencia: '01/2026', detalhe: 'd' }] };
  const [a] = avisosExibiveis(semWarnings, teto);
  expect(a.codigo).toBe('FUTURO_X');
  expect(a.frase).toContain('não entendemos');
  expect(a.gravidade).toBe('alta');       // desconhecido falha aberto: assume o pior
});

it('junta os indicadores do INSS num aviso só, com os códigos crus', () => {
  // dois vínculos com indicadores -> um AvisoExibivel origem 'inss' contendo 'PREM-EXT'
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/lib/apresentacao/avisos.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Estreitar `AvisoTeto.codigo` em `src/lib/teto/types.ts`**

Trocar `codigo: string` por `codigo: CodigoAvisoTeto`, com a união dos cinco códigos que `calcular.ts`, `cascata.ts` e `competencias.ts` emitem. Exportar o tipo em `src/lib/teto/index.ts`. Mudança de tipo apenas — nenhum efeito em runtime.

- [ ] **Step 4: Implementar `avisosExibiveis` em `src/lib/apresentacao/avisos.ts`**

O dicionário é `Record<WarningCode | CodigoAvisoTeto, { frase: string; gravidade: 'alta' | 'media' }>` — tipo exaustivo, então um código novo **não compila** sem frase. A busca aceita `string` e cai no genérico quando não encontra. Cada frase diz o que aconteceu **e o que isso faz com o resultado** (ex.: `BLOCO_PULADO` → "um trecho do extrato não pôde ser lido, e as competências dele ficaram fora da conta").

- [ ] **Step 5: Rodar os testes e o typecheck**

Run: `npx vitest run src/lib/apresentacao/avisos.test.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS nos novos, PASS nos 168 da F1/F2, typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apresentacao/avisos.* src/lib/teto/types.ts src/lib/teto/index.ts
git commit -m "feat(f3): avisos em portugues, com codigo desconhecido falhando aberto"
```

---

### Task 3: agrupar por ano, e a fixture dos gatilhos

**Files:**
- Create: `src/lib/apresentacao/anos.ts`, `src/lib/apresentacao/anos.test.ts`, `src/lib/apresentacao/__fixtures__/gatilhos.ts`
- Test: `src/lib/apresentacao/anos.test.ts`

**Interfaces:**
- Consumes: `ResultadoTeto`, `ResultadoCompetencia`.
- Produces:
```ts
export type GrupoAno = {
  ano: number;
  meses: ResultadoCompetencia[];      // crescente por mês; 13/AAAA sempre por último
  mesesAcimaDoTeto: number;           // competências distintas
  totalAPedirCentavos: number;        // só prescricao.noPrazo
  totalPrescritoCentavos: number;
  temUrgente: boolean;
};
export function agruparPorAno(teto: ResultadoTeto): GrupoAno[];   // ano mais recente primeiro
```
  E a fixture compartilhada, consumida pelas Tasks 7, 8 e 10:
```ts
export const RESULTADO_GATILHOS: ResultadoTeto;  // liga TODOS os gatilhos da §9
export const PARSE_GATILHOS: ParseResult;        // warnings do parser + indicadores do INSS
export const RESULTADO_VAZIO: ResultadoTeto;     // competencias: [], resumo zerado
```

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('ordena ano mais recente primeiro e, dentro do ano, 13 por último', () => {
  const g = agruparPorAno(RESULTADO_GATILHOS);
  expect(g.map((x) => x.ano)).toEqual([...].sort().reverse());
  const dois024 = g.find((x) => x.ano === 2024)!;
  expect(dois024.meses.at(-1)!.competencia).toBe('13/2024');
});

it('13º não soma com dezembro: duas linhas, no mesmo cartão', () => { /* 12/2024 e 13/2024 */ });
it('ano só com meses prescritos tem totalAPedirCentavos 0 e totalPrescrito > 0', () => {});
it('ano sem mês acima do teto aparece, com mesesAcimaDoTeto 0', () => {});
it('competências fora de ordem na entrada saem ordenadas', () => {});
it('RESULTADO_VAZIO devolve lista vazia', () => {});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/lib/apresentacao/anos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Escrever a fixture `__fixtures__/gatilhos.ts`**

`RESULTADO_GATILHOS` é um literal `ResultadoTeto` que liga, de propósito, **todos** os gatilhos da tabela da §7 da spec: camada com `lido: false` e camada com `lido: true`; `baseExcedenteCentavos > 0`; competência com `noPrazo: false`; competência com `urgente: true`; um `achado` `MEI_DAS_INDEVIDO`; `ignoradasSemTabela` não vazio; `avisos` não vazio; uma competência `13/AAAA`; pelo menos três anos, um deles sem nenhum mês acima do teto. Valores de dinheiro inteiros e plausíveis (usar os números do oráculo da F2: teto `778602` em 2024, retido a maior `5878`).

**Pinado, porque as Tasks 4, 7 e 10 dependem:** `dataReferencia` é `'2026-11-19'`; a última
competência não-13º é `'09/2026'`, com `retidoAMaiorCentavos: 5878` e `multiplosVinculos:
true` (sangria **ativa**, não defasada); `resumo.totalAPedirCentavos` e
`resumo.totalPrescritoCentavos` são a soma exata dos `retidoAMaiorCentavos` das
competências `noPrazo` e das prescritas, respectivamente — senão o invariante da Task 4
quebra por defeito da fixture, não do código. `PARSE_GATILHOS` traz `warnings` de dois códigos e dois vínculos com `indicadores`.

- [ ] **Step 4: Implementar `agruparPorAno` em `src/lib/apresentacao/anos.ts`**

Chave do ano pelo sufixo da competência (`"13/2024"` → 2024). Ordem interna por `MM` numérico, com `13` ao fim por ser maior. Não presumir ordem da entrada.

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run src/lib/apresentacao/anos.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apresentacao/anos.* src/lib/apresentacao/__fixtures__/gatilhos.ts
git commit -m "feat(f3): agrupar competencias por ano, com 13o em linha propria"
```

---

### Task 4: `derivarVeredito` — os dois resultados, e o invariante contra o motor

**Files:**
- Create: `src/lib/apresentacao/veredito.ts`, `src/lib/apresentacao/veredito.test.ts`
- Test: `src/lib/apresentacao/veredito.test.ts`

**Interfaces:**
- Consumes: `ResultadoTeto` (Task 3 para as fixtures).
- Produces:
```ts
export type Marca = 'bate' | 'naoBate';
export type Marcas = Readonly<Record<string, Marca>>;   // chave = competência; ausência = sem marca

export type Sangria =
  | { tipo: 'ativa'; competencia: string; centavos: number; defasado: boolean }
  | { tipo: 'recente'; competencia: string }
  | { tipo: 'divergente'; competencia: string }
  | { tipo: 'nenhuma' }
  | { tipo: 'nadaAvaliado' };

export type Acumulado = {
  totalAPedirCentavos: number; mesesAPedir: number;
  totalPrescritoCentavos: number; mesesPrescritos: number;
  mesesUrgentes: number; competenciasDivergentes: string[];
};

export function derivarVeredito(teto: ResultadoTeto, marcas: Marcas):
  { sangria: Sangria; acumulado: Acumulado; mesesComMultiplosVinculos: number };
```

Regras, da spec §6.1, §6.2 e §6.4:
- `ultimaCompetencia` = maior competência **não-13º**, por ano e depois mês.
- `ativa` quando ela tem `retidoAMaiorCentavos > 0`; `defasado` quando ela é mais de **4 meses** anterior a `teto.dataReferencia`.
- `recente` quando ela é zero mas alguma das **12** competências anteriores excedeu.
- `divergente` quando ela está marcada `naoBate` — tem precedência sobre `ativa`.
- `nadaAvaliado` quando `competencias` está vazio (com ou sem `ignoradasSemTabela`).
- `nenhuma` quando há competências e nenhuma excedeu.
- Totais **recompostos** somando `retidoAMaiorCentavos`, filtrando por `prescricao.noPrazo` e excluindo as marcadas `naoBate`. Nunca subtraídos do `resumo` do motor.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('último mês com excesso vira sangria ativa, com o mês nomeado', () => {});
it('último mês zero, com excesso nos 12 meses anteriores, vira sangria recente', () => {});
it('último mês marcado naoBate vira sangria divergente, e a cifra não aparece', () => {});
it('nunca houve excesso: sangria nenhuma', () => {});
it('13º no fim do extrato não é a última competência', () => {});   // 13/2025 + 11/2025 -> 11/2025
it('extrato defasado mais de 4 meses marca defasado', () => {});
it('competências fora de ordem não mudam a escolha da última', () => {});

// Review Focus 1 e 2
it('competencias vazio vira nadaAvaliado, não veredito limpo', () => {
  expect(derivarVeredito(RESULTADO_VAZIO, {}).sangria.tipo).toBe('nadaAvaliado');
});
it('tudo em ignoradasSemTabela também vira nadaAvaliado', () => {});

// Review Focus 4
it('dataReferencia anos à frente não esconde competência: o motor decide noPrazo, não a tela', () => {
  // mesmo com dataReferencia em 2099, as competências noPrazo:true seguem no total a pedir
});

// o invariante
it('sem nenhuma marca, os totais recompostos são idênticos ao resumo do motor', () => {
  const { acumulado } = derivarVeredito(RESULTADO_GATILHOS, {});
  expect(acumulado.totalAPedirCentavos).toBe(RESULTADO_GATILHOS.resumo.totalAPedirCentavos);
  expect(acumulado.totalPrescritoCentavos).toBe(RESULTADO_GATILHOS.resumo.totalPrescritoCentavos);
});

it('naoBate num mês no prazo sai do total a pedir e entra em competenciasDivergentes', () => {});
it('naoBate num mês prescrito desconta do total prescrito, não do total a pedir', () => {});
it('mês sem marca conta normalmente', () => {});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/lib/apresentacao/veredito.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `derivarVeredito` em `src/lib/apresentacao/veredito.ts`**

A comparação de defasagem é por aritmética de ano e mês sobre as strings (`AAAA * 12 + MM`), não por `Date`: comparar meses com `Date` convida fuso e fim de mês. `mesesComMultiplosVinculos` sai do `resumo` do motor, sem recomposição — a marca do professor diz que nosso **valor** está errado, não que o mês deixou de ter dois vínculos.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/lib/apresentacao/veredito.test.ts`
Expected: PASS, 14 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apresentacao/veredito.*
git commit -m "feat(f3): derivar os dois vereditos, com total recomposto e invariante"
```

---

### Task 5: texto de divergência, sem PII, e o contato do sindicato

**Files:**
- Create: `src/lib/apresentacao/divergencia.ts`, `src/lib/apresentacao/divergencia.test.ts`, `src/lib/apresentacao/sindicato.ts`

**Interfaces:**
- Consumes: `ResultadoCompetencia`, `formatarCentavos` (Task 1).
- Produces:
```ts
export function textoDivergencia(c: ResultadoCompetencia): string;
export const SINDICATO: { nome: string; contato: string | null };
```

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('traz a competência, as camadas lidas e o total calculado', () => {
  const t = textoDivergencia(competencia0824);
  expect(t).toContain('08/2024');
  expect(t).toContain('R$ 9.500,00');
  expect(t).toContain('R$ 58,78');
});

it('não contém nome, CPF nem NIT — a função não os recebe', () => {
  // ResultadoCompetencia não tem esses campos; o teste fixa que nenhum literal de
  // identificação foi introduzido, varrendo o texto por /\d{3}\.\d{3}\.\d{3}-\d{2}/ e
  // /\d{3}\.\d{5}\.\d{2}-\d/
});

it('avisa, dentro do texto, que ele não contém dados de identificação', () => {
  expect(textoDivergencia(competencia0824)).toContain('não contém');
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/lib/apresentacao/divergencia.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `textoDivergencia` e `SINDICATO`**

O texto é plano, pronto para colar em e-mail ou WhatsApp: a competência, uma linha por camada com natureza e valor, o total que o motor calculou, a frase "este texto não contém seu nome, CPF ou NIT" e a versão do app se houver. `SINDICATO.contato` nasce `null` — comentário no arquivo explica que é o único valor de espera do ciclo, a ser trocado pelo e-mail ou pela página do Sinpro-ABC antes de o app ir ao ar.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/lib/apresentacao/divergencia.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apresentacao/divergencia.* src/lib/apresentacao/sindicato.ts
git commit -m "feat(f3): texto de divergencia para o sindicato, sem dado de identificacao"
```

---

### Task 6: infraestrutura de teste de componente, e o `Dinheiro`

**Files:**
- Create: `src/components/dinheiro.tsx`, `src/components/dinheiro.test.tsx`
- Modify: `package.json`, `vitest.config.ts` → renomear para `vitest.config.mts`, `eslint.config.mjs`

**Interfaces:**
- Consumes: `formatarCentavos` (Task 1).
- Produces:
```tsx
export type Natureza = 'estimado' | 'lido' | 'exato';
export type Elegibilidade = 'noPrazo' | 'prescrito' | 'naoSeAplica';
export function Dinheiro(props: {
  centavos: number; natureza: Natureza; elegibilidade: Elegibilidade;
}): ReactNode;
```

- [ ] **Step 1: Instalar as dependências de teste e renomear o config**

```bash
npm install -D @vitejs/plugin-react @testing-library/react @testing-library/dom jsdom
git mv vitest.config.ts vitest.config.mts
```

No `vitest.config.mts`: acrescentar `plugins: [react()]`, manter o alias `@` existente, manter `environment: 'node'` e trocar `include` para `['src/**/*.test.ts', 'src/**/*.test.tsx']`. Os testes de componente declaram `// @vitest-environment jsdom` na primeira linha do arquivo.

- [ ] **Step 2: Escrever o teste que falha**

```tsx
// @vitest-environment jsdom
it('mostra o valor com o rótulo da natureza, em texto', () => {
  render(<Dinheiro centavos={5878} natureza="estimado" elegibilidade="noPrazo" />);
  expect(screen.getByText('R$ 58,78')).toBeDefined();
  expect(screen.getByText(/estimado/i)).toBeDefined();
});

it('distingue lido de estimado por texto, não só por cor', () => {
  // renderiza os dois e afirma textos diferentes ('lido do extrato' vs 'estimado')
});

it('marca prescrito junto do valor', () => {
  render(<Dinheiro centavos={41207} natureza="estimado" elegibilidade="prescrito" />);
  expect(screen.getByText(/prescrito/i)).toBeDefined();
});

it('elegibilidade naoSeAplica não inventa rótulo', () => {});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `npx vitest run src/components/dinheiro.test.tsx`
Expected: FAIL — componente não encontrado.

- [ ] **Step 4: Implementar `Dinheiro` em `src/components/dinheiro.tsx`**

As três props são obrigatórias — sem valor padrão, sem `?`. O rótulo é texto visível ao lado do número (não `title`, não `aria-label` sozinho), em `<span>` de peso menor. Tamanho do número ≥ 16px.

- [ ] **Step 5: Cercar `formatarCentavos` no ESLint**

Em `eslint.config.mjs`, acrescentar um bloco `no-restricted-imports` que proíbe importar `@/lib/apresentacao/dinheiro` em qualquer arquivo **exceto** `src/components/dinheiro.tsx` (usar um segundo objeto de config com `files` e `rules`, e nele a mensagem "formate dinheiro pelo componente Dinheiro, que exige natureza e elegibilidade").

- [ ] **Step 6: Rodar tudo**

Run: `npx vitest run && npx eslint . && npx tsc --noEmit`
Expected: PASS nos 168 + novos; ESLint limpo; typecheck limpo. O aviso de ESM/CommonJS do Vite deve ter desaparecido com o `.mts`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.mts eslint.config.mjs src/components/dinheiro.*
git commit -m "feat(f3): componente Dinheiro com natureza obrigatoria, e jsdom nos testes"
```

---

### Task 7: a tela de veredito

**Files:**
- Create: `src/components/veredito.tsx`, `src/components/veredito.test.tsx`, `src/components/bloco-avisos.tsx`
- Test: `src/components/veredito.test.tsx`

**Interfaces:**
- Consumes: `derivarVeredito` (Task 4), `avisosExibiveis` (Task 2), `Dinheiro` (Task 6), `SINDICATO` (Task 5), fixtures (Task 3).
- Produces:
```tsx
export function Veredito(props: {
  teto: ResultadoTeto; parse: ParseResult; marcas: Marcas; onConferir: () => void;
}): ReactNode;
export function BlocoAvisos(props: { avisos: AvisoExibivel[] }): ReactNode;
```

Estrutura, na ordem: bloco de avisos (quando houver) → **sangria** ("você está pagando a mais agora", com o mês nomeado e o botão da F4 desabilitado com motivo) → **acumulado** (total a pedir e, separado e em peso menor, total prescrito; contagem de urgentes; botão "ver mês a mês" chamando `onConferir`) → cartão do achado do MEI, fora dos totais → rodapé permanente com as duas frases de sempre.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// @vitest-environment jsdom
it('sangria ativa nomeia o mês e não promete recuperar o passado', () => {
  render(<Veredito teto={RESULTADO_GATILHOS} parse={PARSE_GATILHOS} marcas={{}} onConferir={() => {}} />);
  expect(screen.getByText(/09\/2026/)).toBeDefined();
  expect(screen.getByRole('button', { name: /declara/i })).toHaveProperty('disabled', true);
});

it('mostra total a pedir e total prescrito como números separados, nunca somados', () => {});
it('promove a contagem de meses urgentes', () => {});       // /prescrevem em até 90 dias/
it('o achado do MEI aparece com o rito do e-CAC e fora dos totais', () => {});  // /2\.055/
it('encaminha a restituição ao sindicato, sem ensinar o PER/DCOMP', () => {});
it('o rodapé permanente traz triagem e privacidade', () => {});
it('nadaAvaliado não diz "não encontramos mês acima do teto"', () => {});
it('onConferir é chamado no botão de ver mês a mês', () => {});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/veredito.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `BlocoAvisos` e `Veredito`**

`BlocoAvisos` é **um só** bloco, com as três origens juntas, `role="alert"` no contêiner (não em `<ul>`), contagem no topo. `Veredito` não calcula nada: tudo vem de `derivarVeredito` e `avisosExibiveis`. Todo valor em dinheiro passa pelo `Dinheiro`. O texto da restituição nomeia o rito em uma frase e encaminha ao `SINDICATO` — quando `contato` é `null`, "procure o Sinpro-ABC".

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/veredito.test.tsx`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/components/veredito.* src/components/bloco-avisos.tsx
git commit -m "feat(f3): tela de veredito, com os dois resultados separados"
```

---

### Task 8: a tela de conferência

**Files:**
- Create: `src/components/conferencia.tsx`, `src/components/conferencia.test.tsx`
- Test: `src/components/conferencia.test.tsx`

**Interfaces:**
- Consumes: `agruparPorAno` (Task 3), `Dinheiro` (Task 6), `textoDivergencia` (Task 5), fixtures (Task 3).
- Produces:
```tsx
export function Conferencia(props: {
  teto: ResultadoTeto; marcas: Marcas;
  onMarcar: (competencia: string, marca: Marca) => void;
  onVoltar: () => void;
}): ReactNode;
```

Cartão por ano em `<details>` (acessível de graça), fechado por padrão, com o ano da última competência aberto. Uma linha por competência, camadas aninhadas com natureza, e o par de radio "bate com meu PDF" / "não bate". Linha do 13º rotulada "teto próprio, calculado em separado de dezembro". Linha prescrita em peso menor, com a data de prescrição e "fora do pedido". Ao fim, a lista de `ignoradasSemTabela` sob "não avaliadas, fora do período coberto".

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// @vitest-environment jsdom
it('um cartão por ano, mais recente primeiro, com o ano da última competência aberto', () => {});
it('cada competência tem o par de radio, inclusive prescrita e 13º', () => {});
it('marcar não bate chama onMarcar com a competência', () => {});
it('marcar não bate mostra o texto para copiar, sem CPF nem NIT', () => {});
it('a linha do 13º diz que o teto é próprio', () => {});
it('a linha prescrita mostra a data de prescrição e "fora do pedido"', () => {});
it('a linha urgente tem destaque em texto, não só em cor', () => {});
it('camada lida e camada estimada aparecem rotuladas diferente', () => {});
it('lista as competências não avaliadas por falta de tabela', () => {});
it('navegação por teclado alcança os radio e os acordeões', () => {});   // tabIndex/role

// Review Focus 5
it('valor grande e nome de empregador longo não quebram o número', () => {
  // renderiza R$ 1.000.000,00 com nome de 80 caracteres e afirma que o texto do valor
  // está num único nó, com a classe que impede quebra (whitespace-nowrap)
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/conferencia.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `Conferencia`**

Radio agrupados por `name={competencia}`, com `<fieldset>` e `<legend>` visualmente oculta por competência, para o leitor de tela saber de que mês é o par. O número do dinheiro em `whitespace-nowrap`; o nome do empregador é quem quebra. Layout em cartões no celular, tabela a partir de `sm:`.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/conferencia.test.tsx`
Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/components/conferencia.*
git commit -m "feat(f3): tela de conferencia mes a mes, com o ato de conferir na linha"
```

---

### Task 9: ligar as telas no app e aposentar o dump de JSON

**Files:**
- Modify: `src/components/upload-cnis.tsx`, `src/app/globals.css`
- Test: `src/components/upload-cnis.test.tsx` (criar)

**Interfaces:**
- Consumes: `Veredito` (Task 7), `Conferencia` (Task 8), `calcularTeto` de `@/lib/teto`.
- Produces: nada para tarefas seguintes.

A máquina de estados passa a ser `inicial | processando | erro | veredito | conferencia`, com `marcas` em `useState`. `calcularTeto(extrato, dataReferencia)` é chamado uma vez, logo após o parse, com `dataReferencia` derivada de `new Date()` em **data local** no formato `AAAA-MM-DD` (não `toISOString`, que entrega UTC e vira o dia à noite em São Paulo). Saem: o `<pre>` do JSON, o botão "Baixar JSON" e a função `baixarJson`. Os painéis de vínculo não-CLT e de indicadores do INSS deixam de existir aqui — a informação passa a chegar pelo `BlocoAvisos` da Task 7.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// @vitest-environment jsdom
it('não existe mais caminho para baixar o extrato como JSON', () => {
  // renderiza UploadCnis e afirma ausência de botão /json/i
});
it('a data de referência é local, não UTC', () => {
  // função exportada dataReferenciaLocal(d: Date): string, com 2026-11-19T23:30-03:00
  expect(dataReferenciaLocal(new Date(2026, 10, 19, 23, 30))).toBe('2026-11-19');
});
it('o estado volta do veredito para a conferência e de volta, sem perder as marcas', () => {});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/upload-cnis.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Reescrever o corpo de `upload-cnis.tsx`**

Manter intactos: a dropzone, a guarda `emProcessamento`, o tratamento de `CnisParseError` e a frase de privacidade do cabeçalho. Exportar `dataReferenciaLocal(d: Date): string` para o teste. A função `Resultado` interna é substituída pelos dois componentes novos.

- [ ] **Step 4: Fixar o tema claro em `globals.css`**

Acrescentar `color-scheme: light` no `:root` e remover o bloco `@media (prefers-color-scheme: dark)`, que hoje contradiz o fundo branco fixo da página e faria radio e checkbox da Task 8 renderizarem escuros sobre cartão branco.

- [ ] **Step 5: Corrigir o contraste da dropzone**

`border-neutral-400` sobre branco fica abaixo de 3:1 (WCAG 1.4.11). Subir para um tom que passe — `border-neutral-500` ou mais escuro — mantendo o realce de arraste.

- [ ] **Step 6: Rodar tudo e olhar a tela**

Run: `npx vitest run && npx eslint . && npx tsc --noEmit && npm run build`
Expected: tudo PASS, build limpo. Em seguida `npm run dev`, subir o `extrato-exemplo.pdf` e conferir à mão: veredito, ida e volta para a conferência, nenhum JSON à vista.

- [ ] **Step 7: Commit**

```bash
git add src/components/upload-cnis.tsx src/components/upload-cnis.test.tsx src/app/globals.css
git commit -m "feat(f3): ligar veredito e conferencia, e remover o dump de JSON"
```

---

### Task 10: o teste de conformidade da §9

**Files:**
- Create: `src/components/disclaimers.test.tsx`

**Interfaces:**
- Consumes: `Veredito`, `Conferencia`, `RESULTADO_GATILHOS`, `PARSE_GATILHOS`.
- Produces: nada.

Este teste é o que faz a §9 ser requisito verificado. Uma tabela de casos, uma linha por gatilho da §7 da spec, cada um afirmando a frase correspondente no documento renderizado — as duas telas renderizadas no mesmo arquivo, porque alguns gatilhos vivem em cada uma.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// @vitest-environment jsdom
const GATILHOS = [
  ['camada estimada',        /estimado/i,                      'conferencia'],
  ['camada lida',            /lido do extrato/i,               'conferencia'],
  ['base excedente exata',   /exat/i,                          'ambas'],
  ['mês prescrito',          /fora do pedido/i,                'ambas'],
  ['mês urgente',            /90 dias/i,                       'ambas'],
  ['achado do MEI',          /2\.055/,                         'veredito'],
  ['não avaliadas',          /fora do período coberto/i,       'conferencia'],
  ['avisos',                 /não entendemos|não pôde ser lido/i, 'veredito'],
  ['13º com teto próprio',   /teto próprio/i,                  'conferencia'],
  ['rodapé triagem',         /triagem/i,                       'veredito'],
  ['rodapé privacidade',     /não sai do seu navegador/i,      'veredito'],
] as const;

it.each(GATILHOS)('§9: %s', (_nome, frase, onde) => { /* renderiza e afirma */ });
```

- [ ] **Step 2: Rodar e verificar que falha nas linhas ainda não cobertas**

Run: `npx vitest run src/components/disclaimers.test.tsx`
Expected: FAIL nas frases que faltarem — cada falha é uma linha da §9 ainda não implementada.

- [ ] **Step 3: Ajustar os componentes até as onze linhas passarem**

Mexer em `veredito.tsx` e `conferencia.tsx`, não no teste. Se uma frase não couber na tela sem virar faixa de aviso, ela vai colada ao número (é a regra da §7 da spec: colado no número, promovido ao veredito, lista no fim, ou rodapé).

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run`
Expected: PASS, as onze linhas e tudo o que já existia.

- [ ] **Step 5: Commit**

```bash
git add src/components/disclaimers.test.tsx src/components/veredito.tsx src/components/conferencia.tsx
git commit -m "test(f3): conformidade com os onze disclaimers da §9"
```

---

### Task 11: folha de impressão da conferência

**Files:**
- Modify: `src/app/globals.css`, `src/components/conferencia.tsx`

**Interfaces:** nada novo.

Item de menor prioridade do ciclo, conforme a §6.6 da spec: se algo cair, cai este.

- [ ] **Step 1: Escrever a regra `@media print` em `globals.css`**

Esconder dropzone, botões e os radio; abrir todos os `<details>`; preto sobre branco; evitar quebra de página dentro de um cartão de ano (`break-inside: avoid`). Manter visíveis os rótulos de natureza e de prescrição — uma folha impressa sem eles é exatamente o "número solto" que a §9 proíbe.

- [ ] **Step 2: Verificar à mão**

Run: `npm run dev`, abrir a conferência, Ctrl+P e conferir a pré-visualização: todos os anos abertos, sem controles, com os rótulos.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css src/components/conferencia.tsx
git commit -m "feat(f3): folha de impressao da conferencia, para levar ao e-CAC"
```

---

## Ao fim do plano

- [ ] `npx vitest run && npx eslint . && npx tsc --noEmit && npm run build` limpos.
- [ ] Atualizar `docs/superpowers/pendencias-f1.md` com uma seção "Pendências depois da F3": contato do sindicato ainda em `null`; tema escuro fora de escopo; gráfico por ano derivável de `anos.ts`; Firefox, Safari e leitor de tela reais ainda não verificados, agora com formulário na tela; o portão de conferência da F4 ainda por definir.
- [ ] Abrir PR para `main`.
