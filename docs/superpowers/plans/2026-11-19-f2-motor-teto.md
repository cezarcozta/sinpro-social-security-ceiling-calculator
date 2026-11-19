# F2 — Motor de Cálculo de Teto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma biblioteca pura em `src/lib/teto/` que recebe o `CnisExtrato` da F1 e uma `dataReferencia`, e devolve, por competência, se o professor contribuiu acima do teto do INSS, quanto em base excedente (exato) e quanto em dinheiro retido a maior (estimado), com elegibilidade de prescrição marcada mês a mês.

**Architecture:** Sete módulos em camadas, sem UI e sem I/O. `tabelas.ts` e `aliquotas.ts` não conhecem CNIS; `competencias.ts` não conhece alíquotas; `cascata.ts` recebe bases já agrupadas; `calcular.ts` é o único que vê os dois mundos. O cálculo do "quanto" é o **modelo progressivo por faixas** (`retido − devido`), não `14% × excedente` — a fórmula da `AGENTS.md` foi descartada na spec §2.1 por errar ~4x para cima. Toda aritmética é em centavos inteiros e pontos-base inteiros; fração só existe dentro de `aplicar()` e `bpsDe()`.

**Tech Stack:** TypeScript, Vitest 5.1.1. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-18-f2-motor-teto-design.md` — leia as seções 4 a 8 por inteiro antes da Task 1. A §9 (disclaimers) é requisito da F3 e **não** é implementada aqui; a §10 lista as pendências que continuam abertas.

## Global Constraints

- Todo valor monetário é **centavos inteiros**, ponta a ponta. Nenhum campo de saída em reais. Formatar é da F3.
- Toda alíquota é **pontos-base inteiros** (`500`, `750`, `900`, `1100`, `1200`, `1400`, `2000`).
- `*` e `/` com dinheiro só dentro de `aplicar()` e `bpsDe()` (Task 2). Em nenhum outro lugar de `src/lib/teto/`.
- Proibido `parseFloat`, `toFixed`, `Number(x) / 100` em `src/lib/teto/`.
- Proibido `new Date()` sem argumento, `Date.now()`, `Math.random()` e qualquer I/O em `src/lib/teto/`. A data de hoje entra sempre por parâmetro (`dataReferencia`).
- Arredondamento: **meio-para-cima, por faixa** (spec §6.3). Um teste fixa a escolha.
- Nenhum descarte silencioso. O que não for entendido vira item em `avisos` ou `ignoradasSemTabela`, nunca ausência.
- Comentários, nomes de teste e textos de aviso em português, como o resto do repositório.
- Rodar a suíte inteira (`npm test`) antes de cada commit, não só o teste da task.

## Correção à spec que este plano aplica

A spec §6.1 escreve o retido do `CI_PRESTADOR` como `Σ aplicar(base_i, 1100)`, **sem** o
`min(base_i, teto)` que a §2.1 exige para o CLT. Isso reintroduz exatamente o falso
positivo que o `min` existe para evitar: um professor com um único vínculo de prestador de
R$ 9.000,00 em 2024 teria retido R$ 990,00 contra devido R$ 856,46 e apareceria com
R$ 133,54 a receber, quando o tomador retinha corretamente. Este plano aplica
`min(base_i, T.teto)` por fonte nas **três** camadas. O teste da Task 5 ("vínculo único de
prestador acima do teto dá zero") pina a correção.

## Review Focus

Classes de entrada que a spec implica e que nenhuma task exercitaria por acidente. Cada
linha tem o seu teste apontado para a task que possui o código.

1. **Competência duplicada em tabela CLT.** O parser entrega os dois registros por decisão
   documentada em `cnis/types.ts`. Se a F2 somar, a base do mês dobra e o motor **inventa
   crédito** — o erro mais caro que este produto pode cometer. → Task 3.
2. **`salarioContribuicaoCentavos` igual a zero** numa linha `CI_PROPRIO`: `bpsDe` divide
   por ela. Devolver `0` e emitir aviso, nunca `Infinity`/`NaN` vazando para a saída. → Task 2 e Task 5.
3. **Competências fora de 01/2021–12/2026.** A fixture real tem vínculo desde 2003. Têm que
   sair em `ignoradasSemTabela` sem exceção e sem entrar em nenhum total. → Task 1 e Task 6.
4. **Extrato sem vínculo, ou vínculo com lista de competências vazia.** Resultado válido e
   vazio, com `resumo` zerado; nenhum acesso a `[0]`. → Task 6.
5. **Competência com texto inesperado** (`""`, `"00/2024"`, `"13/2024"`). `13/AAAA` é
   legítimo e tem regra própria; o resto não pode quebrar o motor nem virar `NaN` numa data.
   → Task 4.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Conhece CNIS? |
|---|---|---|
| `src/lib/teto/types.ts` | tipos de saída (spec §7) e `TabelaVigencia` | só os tipos da F1 que importa |
| `src/lib/teto/tabelas.ts` | as 7 vigências; competência → tabela | não |
| `src/lib/teto/aliquotas.ts` | `aplicar`, `bpsDe`, `confere`, `contribuicao` | não |
| `src/lib/teto/competencias.ts` | `CnisExtrato` → bases por competência e natureza | sim |
| `src/lib/teto/prescricao.ts` | competência + `dataReferencia` → prescrição | não |
| `src/lib/teto/cascata.ts` | a cascata CLT → prestador → próprio | não |
| `src/lib/teto/calcular.ts` | orquestra, monta resumo e achados | sim |
| `src/lib/teto/index.ts` | superfície pública | — |

Um `.test.ts` por módulo ao lado dele, como na F1.

---

### Task 1: Tabelas de vigência

**Files:**
- Create: `src/lib/teto/types.ts`
- Create: `src/lib/teto/tabelas.ts`
- Test: `src/lib/teto/tabelas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Faixa = readonly [topoCentavos: number, bps: number]`
  - `type TabelaVigencia = { readonly vigencia: string; readonly tetoCentavos: number; readonly faixas: readonly Faixa[] }`
  - `const VIGENCIAS: readonly TabelaVigencia[]` (ordenada por vigência crescente)
  - `function tabelaDe(competencia: string): TabelaVigencia | null`

- [ ] **Step 1: Write the failing test** em `tabelas.test.ts`

```ts
describe('tabelaDe', () => {
  it('resolve pela competência, não pelo ano: 04/2023 e 05/2023 têm vigências diferentes', () => {
    expect(tabelaDe('04/2023')?.vigencia).toBe('2023-01');
    expect(tabelaDe('05/2023')?.vigencia).toBe('2023-05');
    expect(tabelaDe('04/2023')?.faixas[0][0]).toBe(130200);
    expect(tabelaDe('05/2023')?.faixas[0][0]).toBe(132000);
    expect(tabelaDe('05/2023')?.tetoCentavos).toBe(tabelaDe('04/2023')?.tetoCentavos);
  });

  it('o 13º usa a tabela de dezembro do mesmo ano', () => {
    expect(tabelaDe('13/2024')?.vigencia).toBe(tabelaDe('12/2024')?.vigencia);
  });

  it('devolve null fora do período coberto', () => {
    expect(tabelaDe('12/2020')).toBeNull();
    expect(tabelaDe('01/2027')).toBeNull();
  });

  it('devolve null para competência malformada', () => {
    for (const lixo of ['', '2024', '00/2024', '14/2024', 'ab/2024', '01/20x4']) {
      expect(tabelaDe(lixo)).toBeNull();
    }
  });

  it('cada tabela tem a última faixa terminando no teto e alíquotas crescentes', () => {
    for (const t of VIGENCIAS) {
      expect(t.faixas.at(-1)![0]).toBe(t.tetoCentavos);
      const topos = t.faixas.map(([topo]) => topo);
      const bps = t.faixas.map(([, b]) => b);
      expect(topos).toEqual([...topos].sort((a, b) => a - b));
      expect(bps).toEqual([...bps].sort((a, b) => a - b));
      expect(topos.every(Number.isInteger) && bps.every(Number.isInteger)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/teto/tabelas.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement os tipos em `types.ts` e `VIGENCIAS` + `tabelaDe` em `tabelas.ts`**

Copie as 7 entradas **verbatim** da spec §4.1, cada uma com a portaria de origem em
comentário na própria linha (SEPRT 477/2021, MTP/ME 12/2022, MPS/MF 26/2023,
MPS/MF 27/2023, MPS/MF 2/2024, MPS/MF 6/2025, MPS/MF 13/2026). Os topos são o **topo
acumulado** de cada faixa, como as portarias publicam.

`tabelaDe` valida `competencia` contra `/^(0[1-9]|1[0-3])\/(\d{4})$/`, trata `MM=13` como
`12`, monta a chave `AAAA-MM` e devolve a última vigência menor ou igual a ela; `null` se
não houver nenhuma ou se a competência não casar com o regex. Acrescentar 2027 tem que
continuar sendo uma linha.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/teto/tabelas.test.ts` → PASS. Depois `npm test` inteiro.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teto/types.ts src/lib/teto/tabelas.ts src/lib/teto/tabelas.test.ts
git commit -m "feat: tabelas de teto e faixas das sete vigencias de 2021 a 2026"
```

---

### Task 2: Aritmética inteira e tabela progressiva

**Files:**
- Create: `src/lib/teto/aliquotas.ts`
- Test: `src/lib/teto/aliquotas.test.ts`

**Interfaces:**
- Consumes: `TabelaVigencia` da Task 1.
- Produces:
  - `function aplicar(baseCentavos: number, bps: number): number`
  - `function bpsDe(contribuicaoCentavos: number, baseCentavos: number): number`
  - `function confere(contribuicaoCentavos: number, baseCentavos: number, bpsEsperado: number): boolean`
  - `function contribuicao(baseCentavos: number, tabela: TabelaVigencia): number`

- [ ] **Step 1: Write the failing test** em `aliquotas.test.ts`

Os números do oráculo são os publicados pela VRI Consulting citando a IN RFB 2.110/2022 e
o Decreto 3.048/99 (spec §8) — não é o cálculo conferindo consigo mesmo.

```ts
const T2024 = tabelaDe('08/2024')!;  // teto 778602

describe('contribuicao (oráculo externo)', () => {
  it('reproduz os valores publicados para a tabela de 2024', () => {
    expect(contribuicao(500000, T2024)).toBe(51882);  // R$ 5.000,00 -> 518,82
    expect(contribuicao(450000, T2024)).toBe(44882);  // R$ 4.500,00 -> 448,82
    expect(contribuicao(220000, T2024)).toBe(17682);  // R$ 2.200,00 -> 176,82
    expect(contribuicao(778602, T2024)).toBe(90886);  // no teto   -> 908,86
  });

  it('a base no limite exato de faixa e a um centavo de cada lado', () => {
    expect(contribuicao(141200, T2024)).toBe(10590);
    expect(contribuicao(141199, T2024)).toBe(10590);  // 10589,925 -> meio-para-cima
    expect(contribuicao(141201, T2024)).toBe(10590);
  });

  it('base zero dá zero', () => expect(contribuicao(0, T2024)).toBe(0));

  it('é monotônica e sempre inteira ao longo de toda a tabela', () => {
    let anterior = -1;
    for (let base = 0; base <= T2024.tetoCentavos; base += 997) {
      const v = contribuicao(base, T2024);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(anterior);
      anterior = v;
    }
  });
});

describe('aplicar', () => {
  it('arredonda meio-para-cima e devolve inteiro', () => {
    expect(aplicar(100, 1100)).toBe(11);
    expect(aplicar(50, 1100)).toBe(6);       // 5,5 -> 6
    expect(aplicar(278602, 1100)).toBe(30646); // 306,4622 -> 306,46
    expect(aplicar(140000, 1100)).toBe(15400); // R$ 1.400,00 -> 154,00
  });

  it('aguenta o maior produto possível do motor sem perder precisão', () => {
    expect(aplicar(847555, 1400)).toBe(118658); // 847555*1400 = 1.186.577.000
  });
});

describe('bpsDe', () => {
  it('extrai a alíquota efetiva do par de cifras do recolhimento próprio', () => {
    expect(bpsDe(5225, 104500)).toBe(500);    // 52,25 / 1.045,00 = 5%
    expect(bpsDe(11495, 104500)).toBe(1100);
    expect(bpsDe(20900, 104500)).toBe(2000);
  });

  it('devolve 0 quando a base é zero ou negativa, nunca Infinity ou NaN', () => {
    expect(bpsDe(5225, 0)).toBe(0);
    expect(bpsDe(5225, -1)).toBe(0);
  });
});

describe('confere', () => {
  it('aceita divergência de até um centavo e rejeita acima disso', () => {
    expect(confere(5225, 104500, 500)).toBe(true);
    expect(confere(5226, 104500, 500)).toBe(true);
    expect(confere(5227, 104500, 500)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/teto/aliquotas.test.ts` → FAIL.

- [ ] **Step 3: Implement `aliquotas.ts`**

`aplicar` e `bpsDe` são as **duas únicas** funções do motor com `*` e `/`, e as duas têm
forma inteira fixada pela spec §5 e §6.1 — copie-as como estão, com os comentários que
explicam por que não é `Math.floor`:

```ts
/** base em centavos (inteiro), bps em pontos-base (750 = 7,5%). Devolve centavos inteiros. */
const aplicar = (base: number, bps: number): number => {
  const bruto = base * bps + 5000;              // +5000 = arredondamento meio-para-cima
  return (bruto - (bruto % 10000)) / 10000;     // divisão exata: múltiplo de 10000
};

/** Taxa efetiva em pontos-base, a partir de dois inteiros em centavos. */
const bpsDe = (contribuicao: number, base: number): number => {
  if (base <= 0) return 0;
  const bruto = contribuicao * 10000 * 2 + base;   // meio-para-cima sobre `base`
  const d = base * 2;
  return (bruto - (bruto % d)) / d;
};
```

`contribuicao` percorre as faixas somando `aplicar(larguraDaFaixaOcupada, bps)` — a largura
é `min(base, topo) − topoAnterior`, parando quando a base se esgota. Arredonda **por faixa**
(é o que `aplicar` já faz), porque é o que faz folha de pagamento; o teste de `141199` é o
que impede alguém de trocar isso por arredondar só no fim. `confere` é
`Math.abs(contribuicao - aplicar(base, bpsEsperado)) <= 1` — multiplicação cruzada, nunca
comparação com `0.05`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/teto/aliquotas.test.ts` → PASS. Depois `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teto/aliquotas.ts src/lib/teto/aliquotas.test.ts
git commit -m "feat: tabela progressiva e aritmetica inteira em centavos e pontos-base"
```

---

### Task 3: Agrupamento por competência

**Files:**
- Create: `src/lib/teto/competencias.ts`
- Test: `src/lib/teto/competencias.test.ts`

**Interfaces:**
- Consumes: `CnisExtrato`, `Vinculo`, `Remuneracao`, `Contribuicao` de `@/lib/cnis`.
- Produces:
  - `type FonteRemunerada = { seq: number; codigoEmp?: string; baseCentavos: number; indicadores: string[] }`
  - `type FonteContribuinte = { seq: number; codigoEmp?: string; salarioContribuicaoCentavos: number; contribuicaoCentavos: number; indicadores: string[] }`
  - `type BasesDaCompetencia = { competencia: string; decimoTerceiro: boolean; clt: FonteRemunerada[]; prestador: FonteRemunerada[]; proprio: FonteContribuinte[] }`
  - `function agruparPorCompetencia(extrato: CnisExtrato): { competencias: BasesDaCompetencia[]; avisos: AvisoTeto[] }`
  - `type AvisoTeto = { codigo: string; competencia: string; detalhe: string }` (declarado em `types.ts`)

A ordem de `competencias` é crescente por `AAAA-MM`, com `13/AAAA` logo depois de
`12/AAAA`.

- [ ] **Step 1: Write the failing test** em `competencias.test.ts`

Monte `CnisExtrato` com literais — nada de PDF, nada de camada de texto (spec §8). Um
helper local `extratoCom(...vinculos)` basta.

```ts
describe('agruparPorCompetencia', () => {
  it('soma fontes de vínculos diferentes no mesmo mês, separadas por natureza', () => {
    // CLT seq 1 com 5.000,00 em 08/2024 + prestador seq 2 com 4.000,00 em 08/2024
    const { competencias } = agruparPorCompetencia(extrato);
    expect(competencias).toHaveLength(1);
    expect(competencias[0].clt.map((f) => f.baseCentavos)).toEqual([500000]);
    expect(competencias[0].prestador.map((f) => f.baseCentavos)).toEqual([400000]);
    expect(competencias[0].proprio).toEqual([]);
  });

  it('competência duplicada DENTRO de um vínculo CLT não dobra a base: fica a primeira e sai aviso', () => {
    // seq 1, natureza CLT, remuneracoes: 08/2024 = 500000 e 08/2024 = 500000
    const { competencias, avisos } = agruparPorCompetencia(extrato);
    expect(competencias[0].clt).toHaveLength(1);
    expect(competencias[0].clt[0].baseCentavos).toBe(500000);
    expect(avisos).toEqual([
      expect.objectContaining({ codigo: 'DUPLICADA_DESCARTADA', competencia: '08/2024' }),
    ]);
  });

  it('competência duplicada DENTRO de um vínculo de recolhimento próprio soma: duas guias no mês somam de verdade', () => {
    // seq 1, natureza CI_PROPRIO, duas contribuicoes em 08/2024
    const { competencias, avisos } = agruparPorCompetencia(extrato);
    expect(competencias[0].proprio).toHaveLength(2);
    expect(avisos).toEqual([]);
  });

  it('duas fontes CLT no mesmo mês em vínculos diferentes são duas fontes, não duplicata', () => {
    // seq 1 e seq 2, ambos CLT, ambos com 08/2024
    expect(agruparPorCompetencia(extrato).competencias[0].clt).toHaveLength(2);
    expect(agruparPorCompetencia(extrato).avisos).toEqual([]);
  });

  it('13/AAAA é competência própria e não soma com 12/AAAA', () => {
    // CLT com 12/2024 = 500000 e 13/2024 = 500000
    const { competencias } = agruparPorCompetencia(extrato);
    expect(competencias.map((c) => c.competencia)).toEqual(['12/2024', '13/2024']);
    expect(competencias.map((c) => c.decimoTerceiro)).toEqual([false, true]);
  });

  it('ordena por competência crescente, com o 13º depois de dezembro', () => {
    // entrada fora de ordem: 13/2023, 02/2024, 12/2023, 01/2024
    expect(agruparPorCompetencia(extrato).competencias.map((c) => c.competencia))
      .toEqual(['12/2023', '13/2023', '01/2024', '02/2024']);
  });

  it('extrato sem vínculo e vínculo sem competências devolvem listas vazias', () => {
    expect(agruparPorCompetencia({ filiado: {}, vinculos: [] }).competencias).toEqual([]);
    expect(agruparPorCompetencia(extratoComVinculoVazio).competencias).toEqual([]);
  });

  it('não lê o extrato real para calcular, mas aguenta sua forma', () => {
    // importa a fixture de camada de texto da F1, roda parseCnis e agrupa:
    // nenhuma exceção, toda competência agrupada bate com o regex MM/AAAA.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/teto/competencias.test.ts` → FAIL.

- [ ] **Step 3: Implement `agruparPorCompetencia` em `competencias.ts`**

Percorre `extrato.vinculos` com `switch` exaustivo sobre `natureza` (a união é discriminada
em `cnis/types.ts` justamente para isso). A regra de duplicata é **por natureza e por
vínculo**, resolvendo a pendência que a F1.5 deixou para a F2:

- `CLT` e `CI_PRESTADOR`: duas linhas com a mesma competência **no mesmo vínculo** são
  artefato de leitura do PDF. Fica a primeira, a segunda vira aviso
  `DUPLICADA_DESCARTADA` com os dois valores no `detalhe`. Somar aqui dobraria a base do
  mês e inventaria crédito.
- `CI_PROPRIO`: somam, porque duas guias no mesmo mês somam de verdade. Entram como duas
  fontes na lista.
- Competências iguais em vínculos **diferentes** são sempre fontes distintas — é o caso
  central do produto.

Competência que não casa com `/^(0[1-9]|1[0-3])\/\d{4}$/` vira aviso
`COMPETENCIA_INVALIDA` e não entra em nenhum grupo.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/teto/competencias.test.ts` → PASS. Depois `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teto/competencias.ts src/lib/teto/competencias.test.ts src/lib/teto/types.ts
git commit -m "feat: agrupa remuneracoes por competencia com regra de duplicata por natureza"
```

---

### Task 4: Prescrição

**Files:**
- Create: `src/lib/teto/prescricao.ts`
- Test: `src/lib/teto/prescricao.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Prescricao = { prescreveEm: string; noPrazo: boolean; diasRestantes: number; urgente: boolean }` (em `types.ts`)
  - `function prescricaoDe(competencia: string, dataReferencia: string): Prescricao | null`

Datas em `AAAA-MM-DD`. `null` só para competência malformada.

- [ ] **Step 1: Write the failing test** em `prescricao.test.ts`

```ts
describe('prescricaoDe', () => {
  it('conta 5 anos do vencimento do recolhimento, dia 20 do mês seguinte', () => {
    expect(prescricaoDe('01/2021', '2026-11-19')?.prescreveEm).toBe('2026-02-20');
    expect(prescricaoDe('11/2021', '2026-11-19')?.prescreveEm).toBe('2026-12-20');
  });

  it('dezembro vira o ano: competência 12/2024 recolhe em 01/2025 e prescreve em 2030', () => {
    expect(prescricaoDe('12/2024', '2026-11-19')?.prescreveEm).toBe('2030-01-20');
  });

  it('o 13º segue a competência de dezembro do mesmo ano', () => {
    expect(prescricaoDe('13/2024', '2026-11-19')?.prescreveEm).toBe('2030-01-20');
  });

  it('a virada é no dia exato: no prazo em 19/02, no prazo em 20/02, prescrito em 21/02', () => {
    expect(prescricaoDe('01/2021', '2026-02-19')?.noPrazo).toBe(true);
    expect(prescricaoDe('01/2021', '2026-02-20')?.noPrazo).toBe(true);
    expect(prescricaoDe('01/2021', '2026-02-21')?.noPrazo).toBe(false);
  });

  it('diasRestantes é a diferença em dias e fica negativo depois de prescrever', () => {
    expect(prescricaoDe('01/2021', '2026-02-10')?.diasRestantes).toBe(10);
    expect(prescricaoDe('01/2021', '2026-03-02')?.diasRestantes).toBe(-10);
  });

  it('urgente marca a faixa de até 90 dias, e só ela', () => {
    expect(prescricaoDe('01/2021', '2025-11-22')?.urgente).toBe(true);   // 90 dias
    expect(prescricaoDe('01/2021', '2025-11-21')?.urgente).toBe(false);  // 91 dias
    expect(prescricaoDe('01/2021', '2026-03-02')?.urgente).toBe(false);  // já prescrito
  });

  it('atravessa 29 de fevereiro sem erro de um dia', () => {
    expect(prescricaoDe('01/2019', '2024-02-29')?.diasRestantes).toBe(-9);
  });

  it('devolve null para competência malformada', () => {
    for (const lixo of ['', '00/2024', '14/2024', '2024']) expect(prescricaoDe(lixo, '2026-11-19')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/teto/prescricao.test.ts` → FAIL.

- [ ] **Step 3: Implement `prescricaoDe` em `prescricao.ts`**

Regra única, sem caso especial (spec §6.4): trate `13/AAAA` como `12/AAAA`, então
`prescreveEm = 20 / ((MM mod 12) + 1) / (AAAA + 5 + (MM === 12 ? 1 : 0))`.
`noPrazo = dataReferencia <= prescreveEm`. Faça toda a aritmética de dias com
`Date.UTC(...)` e divida por `86_400_000` — fuso e horário de verão não podem mover a
virada de um dia. `urgente = noPrazo && diasRestantes <= 90`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/teto/prescricao.test.ts` → PASS. Depois `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teto/prescricao.ts src/lib/teto/prescricao.test.ts src/lib/teto/types.ts
git commit -m "feat: prazo de prescricao por competencia, com a virada de ano de dezembro"
```

---

### Task 5: A cascata

**Files:**
- Create: `src/lib/teto/cascata.ts`
- Test: `src/lib/teto/cascata.test.ts`

**Interfaces:**
- Consumes: `aplicar`, `bpsDe`, `confere`, `contribuicao` (Task 2); `TabelaVigencia` (Task 1); `BasesDaCompetencia`, `AvisoTeto` (Task 3).
- Produces:
  - `type Camada = { natureza: NaturezaVinculo; baseCentavos: number; retidoCentavos: number; devidoCentavos: number; lido: boolean }`
  - `type ResultadoCascata = { somaBaseCentavos: number; retidoCentavos: number; devidoCentavos: number; retidoAMaiorCentavos: number; margemFinalCentavos: number; camadas: Camada[]; avisos: AvisoTeto[] }`
  - `function rodarCascata(bases: BasesDaCompetencia, tabela: TabelaVigencia): ResultadoCascata`

`margemFinalCentavos` é a `margem2` da spec §6.1, que a Task 6 usa para o achado do MEI.
Camada sem fonte nenhuma não entra em `camadas`.

- [ ] **Step 1: Write the failing test** em `cascata.test.ts`

```ts
const T2024 = tabelaDe('08/2024')!;

describe('rodarCascata', () => {
  it('reproduz o exemplo da spec: 5.000 + 4.500 CLT em 08/2024', () => {
    const r = rodarCascata(basesClt(500000, 450000), T2024);
    expect(r.retidoCentavos).toBe(96764);        // 518,82 + 448,82
    expect(r.devidoCentavos).toBe(90886);        // progressivo(teto)
    expect(r.retidoAMaiorCentavos).toBe(5878);   // 58,78 — e NÃO os 239,96 da AGENTS.md
  });

  it('vínculo CLT único acima do teto dá zero: o empregador descontou certo', () => {
    expect(rodarCascata(basesClt(900000), T2024).retidoAMaiorCentavos).toBe(0);
  });

  it('vínculo de prestador único acima do teto também dá zero', () => {
    // a correção ao §6.1 da spec: min(base_i, teto) vale nas três camadas
    expect(rodarCascata(basesPrestador(900000), T2024).retidoAMaiorCentavos).toBe(0);
  });

  it('soma exatamente igual ao teto dá zero', () => {
    expect(rodarCascata(basesClt(400000, 378602), T2024).retidoAMaiorCentavos).toBe(0);
  });

  it('CLT abaixo do teto mais prestador: o excesso é todo da camada do prestador', () => {
    const r = rodarCascata(basesMistas({ clt: [500000], prestador: [400000] }), T2024);
    const clt = r.camadas.find((c) => c.natureza === 'CLT')!;
    const prestador = r.camadas.find((c) => c.natureza === 'CI_PRESTADOR')!;
    expect(clt.retidoCentavos - clt.devidoCentavos).toBe(0);
    expect(prestador.retidoCentavos).toBe(44000);   // 11% de 4.000,00
    expect(prestador.devidoCentavos).toBe(30646);   // 11% da margem de 2.786,02
    expect(r.retidoAMaiorCentavos).toBe(13354);
  });

  it('recolhimento próprio é LEITURA, não estimativa', () => {
    const r = rodarCascata(basesProprio({ contribuicao: 5225, salario: 104500 }), T2024);
    const propria = r.camadas.find((c) => c.natureza === 'CI_PROPRIO')!;
    expect(propria.retidoCentavos).toBe(5225);  // o valor escrito no extrato
    expect(propria.lido).toBe(true);
  });

  it('CLT e prestador vêm rotulados como estimativa', () => {
    const r = rodarCascata(basesMistas({ clt: [500000], prestador: [400000] }), T2024);
    expect(r.camadas.every((c) => c.lido === false)).toBe(true);
  });

  it('divergência entre a alíquota paga e a que o indicador promete emite aviso, nunca silêncio', () => {
    // IREC-MEI promete 500 bps; o par de cifras dá 1100
    const r = rodarCascata(basesProprio({ contribuicao: 11495, salario: 104500, indicadores: ['IREC-MEI'] }), T2024);
    expect(r.avisos).toEqual([expect.objectContaining({ codigo: 'ALIQUOTA_DIVERGENTE' })]);
  });

  it('salário de contribuição zero não vira Infinity nem NaN: aviso e camada em zero', () => {
    const r = rodarCascata(basesProprio({ contribuicao: 5225, salario: 0 }), T2024);
    expect(r.camadas.find((c) => c.natureza === 'CI_PROPRIO')!.devidoCentavos).toBe(0);
    expect(Number.isFinite(r.retidoAMaiorCentavos)).toBe(true);
    expect(r.avisos.map((a) => a.codigo)).toContain('BASE_AUSENTE');
  });

  it('retidoAMaior nunca é negativo', () => {
    expect(rodarCascata(basesClt(100000), T2024).retidoAMaiorCentavos).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/teto/cascata.test.ts` → FAIL.

- [ ] **Step 3: Implement `rodarCascata` em `cascata.ts`**

A ordem é legal, não arbitrária: o empregado contribui primeiro, o CI declara sobre o que
sobrar até o teto (spec §6.1). Com a correção da seção "Correção à spec" deste plano
(o `min` por fonte na camada 2):

```
1. CLT
   retido  = Σ contribuicao(min(base_i, T.teto), T)
   devido  = contribuicao(min(Σ base_i, T.teto), T)
   margem1 = max(0, T.teto − min(Σ base_i, T.teto))

2. CI_PRESTADOR  (tomador retém 11%)
   retido  = Σ aplicar(min(base_i, T.teto), 1100)
   devido  = aplicar(min(Σ base_i, margem1), 1100)
   margem2 = max(0, margem1 − min(Σ base_i, margem1))

3. CI_PROPRIO  (valor pago está escrito no extrato)
   retido     = Σ contribuicaoCentavos                  ← LEITURA
   bpsEfetivo = bpsDe(retido, Σ salarioContribuicao)
   devido     = aplicar(min(Σ salarioContribuicao, margem2), bpsEfetivo)
```

`retidoAMaiorCentavos` é a soma de `max(0, retido − devido)` por camada — por camada, e com
o `max`, para que uma camada não compense a outra nem produza negativo.

A conferência de `bpsEfetivo` usa `confere()` contra o que os indicadores prometem:
`IREC-MEI` → 500, `IREC-LC123` sozinho → 1100, nenhum dos dois → 2000. Divergência emite
`ALIQUOTA_DIVERGENTE` com os dois números no `detalhe` — significa que não entendemos a
linha. Soma de salário de contribuição `<= 0` com contribuição `> 0` emite `BASE_AUSENTE` e
deixa a camada com `devidoCentavos: 0`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/teto/cascata.test.ts` → PASS. Depois `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teto/cascata.ts src/lib/teto/cascata.test.ts src/lib/teto/types.ts
git commit -m "feat: cascata CLT, prestador e recolhimento proprio com teto por fonte"
```

---

### Task 6: Orquestração e superfície pública

**Files:**
- Create: `src/lib/teto/calcular.ts`
- Create: `src/lib/teto/index.ts`
- Modify: `src/lib/teto/types.ts` (fecha `ResultadoCompetencia` e `ResultadoTeto`)
- Test: `src/lib/teto/calcular.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 5.
- Produces:
  - `function calcularTeto(extrato: CnisExtrato, dataReferencia: string): ResultadoTeto`
  - `index.ts` exporta `calcularTeto` e os tipos `ResultadoTeto`, `ResultadoCompetencia`, `Camada`, `AvisoTeto`, `Prescricao`.

`ResultadoCompetencia` e `ResultadoTeto` são **verbatim** da spec §7, incluindo
`camadas[].lido` e a ausência de `porAno` (agrupar por ano é apresentação; a F3 deriva).

- [ ] **Step 1: Write the failing test** em `calcular.test.ts`

```ts
describe('calcularTeto', () => {
  it('monta a competência completa do exemplo da spec', () => {
    const r = calcularTeto(extratoCom2024, '2026-11-19');
    expect(r.competencias[0]).toMatchObject({
      competencia: '08/2024',
      decimoTerceiro: false,
      tetoCentavos: 778602,
      somaBaseCentavos: 950000,
      excedeuTeto: true,
      baseExcedenteCentavos: 171398,   // aritmética exata: soma − teto
      retidoAMaiorCentavos: 5878,      // estimativa
      multiplosVinculos: true,
    });
  });

  it('competência fora de 2021–2026 sai em ignoradasSemTabela e não entra em total nenhum', () => {
    const r = calcularTeto(extratoCom2008, '2026-11-19');
    expect(r.ignoradasSemTabela).toContain('06/2008');
    expect(r.competencias.map((c) => c.competencia)).not.toContain('06/2008');
    expect(r.resumo.totalAPedirCentavos).toBe(0);
  });

  it('separa o total a pedir do total prescrito pela elegibilidade de cada mês', () => {
    // mesmo excedente em 01/2021 (prescrito em 19/11/2026) e em 01/2026 (no prazo)
    const r = calcularTeto(extratoDoisAnos, '2026-11-19');
    expect(r.resumo.totalAPedirCentavos).toBeGreaterThan(0);
    expect(r.resumo.totalPrescritoCentavos).toBeGreaterThan(0);
    expect(r.competencias.find((c) => c.competencia === '01/2021')!.prescricao.noPrazo).toBe(false);
  });

  it('mesesAcimaDoTeto e mesesComMultiplosVinculos contam competências distintas, não registros', () => {
    // dois vínculos CLT no mesmo mês: um mês, duas fontes
    const r = calcularTeto(extratoDoisVinculosNoMesmoMes, '2026-11-19');
    expect(r.resumo.mesesComMultiplosVinculos).toBe(1);
    expect(r.resumo.mesesAcimaDoTeto).toBe(1);
  });

  it('o 13º entra como competência própria e não soma com dezembro', () => {
    const r = calcularTeto(extratoCom13, '2026-11-19');
    const treze = r.competencias.find((c) => c.competencia === '13/2024')!;
    expect(treze.decimoTerceiro).toBe(true);
    expect(treze.tetoCentavos).toBe(778602);
    expect(treze.somaBaseCentavos).toBe(500000);  // só a gratificação
  });

  it('MEI com a margem já esgotada gera o achado MEI_DAS_INDEVIDO, fora do total geral', () => {
    const r = calcularTeto(extratoCltNoTetoMaisMei, '2026-11-19');
    const achado = r.achados.find((a) => a.tipo === 'MEI_DAS_INDEVIDO')!;
    expect(achado.competencias).toEqual(['08/2026']);
    expect(achado.valorCentavos).toBeGreaterThan(0);
    expect(r.resumo.totalAPedirCentavos).not.toBe(achado.valorCentavos);
  });

  it('propaga os avisos das camadas inferiores, nunca os engole', () => {
    expect(calcularTeto(extratoComDuplicataClt, '2026-11-19').avisos.map((a) => a.codigo))
      .toContain('DUPLICADA_DESCARTADA');
  });

  it('extrato vazio devolve resultado válido e zerado', () => {
    const r = calcularTeto({ filiado: {}, vinculos: [] }, '2026-11-19');
    expect(r.competencias).toEqual([]);
    expect(r.resumo).toEqual({
      mesesComMultiplosVinculos: 0, mesesAcimaDoTeto: 0,
      totalAPedirCentavos: 0, totalPrescritoCentavos: 0,
    });
  });

  it('devolve a dataReferencia que recebeu e nunca consulta o relógio', () => {
    expect(calcularTeto(extratoCom2024, '2026-11-19').dataReferencia).toBe('2026-11-19');
  });

  it('todo campo *Centavos da saída é inteiro', () => {
    // varredura recursiva do resultado do extrato real parseado + dos extratos sintéticos:
    // toda chave terminada em "Centavos" passa Number.isInteger
  });

  it('roda sobre o extrato real da fixture da F1 sem exceção', () => {
    // parseCnis na fixture de camada de texto -> calcularTeto -> não lança,
    // e competencias.length + ignoradasSemTabela.length > 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/teto/calcular.test.ts` → FAIL.

- [ ] **Step 3: Implement `calcularTeto` em `calcular.ts` e a superfície em `index.ts`**

Agrupa (Task 3), e para cada competência resolve a tabela (Task 1): sem tabela, entra em
`ignoradasSemTabela` e **não é erro**. Com tabela, roda a cascata (Task 5) e a prescrição
(Task 4), e monta `ResultadoCompetencia`. `baseExcedenteCentavos = max(0, soma − teto)` —
subtração de inteiros, aritmética exata, diferente do dinheiro que é estimativa.
`multiplosVinculos` é verdadeiro quando a competência tem duas ou mais fontes somando
`clt + prestador + proprio`.

`resumo`: `totalAPedirCentavos` soma `retidoAMaiorCentavos` só das competências com
`prescricao.noPrazo`; `totalPrescritoCentavos` soma as demais; os dois contadores contam
**competências distintas**, o que corrige de passagem a pendência da F1
("competências lidas soma registros, não meses distintos").

Achado do MEI (spec §6.5): competências com `margemFinalCentavos === 0` e pelo menos uma
fonte `CI_PROPRIO` com `IREC-MEI` entram em `achados` como `MEI_DAS_INDEVIDO`, com
`valorCentavos` somando a contribuição lida dessas linhas. **Fora** do total geral, porque
o caminho de restituição é o Anexo I da IN RFB 2.055/2021 no e-CAC, não o PER/DCOMP Web.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/teto/calcular.test.ts` → PASS. Depois `npm test` inteiro.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teto/calcular.ts src/lib/teto/index.ts src/lib/teto/types.ts src/lib/teto/calcular.test.ts
git commit -m "feat: F2 — motor de calculo de teto com prescricao por competencia"
```

---

### Task 7: A frase que mente na UI, e as pendências

**Files:**
- Modify: `src/components/upload-cnis.tsx`
- Modify: `docs/superpowers/pendencias-f1.md`

Nenhum resultado de cálculo aparece na tela nesta task — o dashboard é a F3 e os
disclaimers da spec §9 são requisito dela. O que se corrige aqui é a afirmação que a F1.5
deixou registrada como falsa.

- [ ] **Step 1: Corrigir o texto**

Hoje o componente chama todo vínculo não-CLT de "contribuinte individual" — mas
`TIPOS_NAO_CLT` aceita Trabalhador Avulso, Segurado Especial e Segurado Facultativo — e
afirma que "o cálculo de teto considera todos eles", quando o motor não existia. Troque por
uma frase que descreva o que o parser de fato leu, sem prometer cálculo que esta task não
exibe.

- [ ] **Step 2: Verificar**

Run: `npm run lint && npx tsc --noEmit && npm test` → tudo passa.

- [ ] **Step 3: Atualizar as pendências**

Em `docs/superpowers/pendencias-f1.md`, seção "Decisões que a F2 precisa tomar": marque
como resolvida a decisão de competência duplicada (apontando para a regra por natureza na
Task 3) e a frase da UI. Abra uma seção "Pendências depois da F2" com o que continua
aberto: as tabelas de 2022 a 2025 vindas de fonte secundária (spec §10 — conferir no DOU
**antes** de o app ir ao ar, é o dado de maior impacto do motor), `IREC-LC123-SUP` não
tratado, `PSC-MEN-SM` não tratado, `Valores Consolidados por Ano Civil` ainda sem uso como
checksum, e os avisos novos que a F3 precisa saber exibir (`ALIQUOTA_DIVERGENTE`,
`BASE_AUSENTE`, `DUPLICADA_DESCARTADA`, `COMPETENCIA_INVALIDA`).

- [ ] **Step 4: Commit**

```bash
git add src/components/upload-cnis.tsx docs/superpowers/pendencias-f1.md
git commit -m "docs: pendencias depois da F2; UI para de prometer calculo que nao exibia"
```
