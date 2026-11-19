# F1.5 — Naturezas de Vínculo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o parser do CNIS ler os dois layouts de tabela que hoje descarta (Contribuinte Individual recolhimento próprio e prestador de serviço) e substituir `ignorados` por `Vinculo.natureza`, para que a F2 possa calcular o teto sem falso negativo.

**Architecture:** O layout da tabela de competências — não o `Tipo Filiado no Vínculo` — é o que determina a natureza do vínculo, porque "Contribuinte Individual" aparece nos dois layouts novos. Um módulo novo `layouts.ts` detecta qual dos três layouts conhecidos é o cabeçalho e devolve a natureza junto com as colunas. O parser passa a construir vínculos num tipo mutável intermediário e os finaliza em união discriminada no fim da varredura, porque a natureza só é conhecida depois do cabeçalho da tabela, que vem depois da linha do vínculo.

**Tech Stack:** TypeScript, Vitest 5.1.1, Next.js 16.4.6. Sem dependências novas.

## Global Constraints

- Todo valor monetário é **centavos inteiros**. Nenhum campo em reais. Converter só com `parseValorCentavos` (`src/lib/cnis/table.ts:56`), que trabalha por manipulação de string.
- Proibido `parseFloat`, `toFixed`, `Number(x) / 100` em `src/lib/cnis/`.
- Nenhum descarte silencioso de dado: o que não for entendido vira `ParseWarning`, nunca ausência.
- O parser roda no navegador do usuário. Sem I/O, sem rede, sem `new Date()`.
- Comentários e mensagens de warning em português, como o resto do módulo.
- Rodar a suíte inteira (`npm test`) antes de cada commit, não só o teste da task.

## Contexto que o implementador precisa

Leia antes de começar:

- `docs/superpowers/specs/2026-11-18-f2-motor-teto-design.md`, seções 2.3 e 3.
- `src/lib/cnis/parse-cnis.ts` por inteiro. É uma máquina de estados sobre linhas do PDF.
- `src/lib/cnis/table.ts` — `mapearColunas`, `celulasPorGrupo`, `parseValorCentavos`.

**Como o parser funciona hoje, em uma frase:** `montarExtrato` percorre linhas agrupadas por coordenada y; `classificar` diz o que cada linha é; o estado `aguardando-cabecalho-tabela` valida o cabeçalho contra `COLUNAS_REMUNERACAO` e, se casar, o estado `tabela` lê cada linha com `celulasPorGrupo`.

**Por que os vínculos não-CLT se perdem hoje:** em `fecharPendente()` (`parse-cnis.ts:88-105`), um vínculo não-CLT entra em `extrato.ignorados` e a variável `vinculo` **não** recebe o novo objeto, ficando `null`. Depois, `if (tipo === 'rotulo-secao')` faz `estado = vinculo ? 'aguardando-cabecalho-tabela' : 'pulando'` — com `vinculo` nulo vai para `'pulando'`, e o cabeçalho da tabela nunca é examinado. Por isso não há vazamento para o vínculo anterior e também não há warning. Verificado na fixture real.

**Os três layouts de tabela** presentes no extrato de exemplo:

| Cabeçalho | Natureza | Vínculos na fixture |
|---|---|---|
| `Competência \| Remuneração \| Indicadores` (×3 grupos) | `CLT` | seq 1, seq 4 |
| `Competência \| Data Pgto. \| Contribuição \| Salário Contribuição \| Indicadores` (×2 grupos) | `CI_PROPRIO` | seq 2, seq 3 |
| `Competência \| Contrat. \| Estabelecimento \| Tomador \| Forma Prestação Serviço \| Remuneração \| Indicadores` (×1 grupo) | `CI_PRESTADOR` | seq 5 |

Não há ambiguidade entre eles: `mapearColunas` exige que a contagem de itens seja múltipla da contagem de rótulos **e** que cada rótulo bata. 3, 5 e 7 são coprimos entre si nas combinações que ocorrem (9 itens casa só com 3; 10 só com 5; 7 só com 7).

### Duas armadilhas da fixture

**A anonimização deslocou as datas ~10 anos, mas a seção `Valores Consolidados por Ano Civil` manteve o teto do ano real.** A linha de 2015 traz `8.157,41 *`, que é o teto de 2025. Qualquer asserção que compare consolidado com tabela de tetos vai falhar por motivo errado. **Esta fase não lê a seção consolidada** — ela segue sendo marcador de fim (`sections.ts`, conjunto `FIM`). Não tente usá-la como checksum aqui.

**A pendência da F1 diz que não há mês com dois vínculos sobrepostos. Isso é falso no geral:** `06/2015` tem CLT `10.996,56` (seq 4, que termina em 27/06/2015) e prestador `100,00` (seq 5, que começa em 01/06/2015). É sobreposição entre naturezas diferentes. Útil como caso de teste.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/cnis/layouts.ts` (criar) | Os três layouts conhecidos e `detectarLayout`. Não conhece a máquina de estados. |
| `src/lib/cnis/layouts.test.ts` (criar) | Testes de `detectarLayout` com `Row` literais. |
| `src/lib/cnis/types.ts` (modificar) | `NaturezaVinculo`, `Contribuicao`, união `Vinculo`, remoção de `VinculoIgnorado` e de `CnisExtrato.ignorados`. |
| `src/lib/cnis/parse-cnis.ts` (modificar) | Usa `detectarLayout`; constrói em tipo mutável e finaliza na união; lê as linhas dos dois layouts novos. |
| `src/lib/cnis/index.ts` (modificar) | Exporta os tipos novos, deixa de exportar `VinculoIgnorado`. |
| `src/lib/cnis/parse-cnis.test.ts` (modificar) | Migra as asserções de `ignorados` para `natureza` e cobre os vínculos novos. |
| `src/components/upload-cnis.tsx` (modificar, na Task 2) | Linhas 121, 134, 144-147 leem `extrato.ignorados`. Ajustado no mesmo commit que remove o campo. |

---

### Task 1: Detecção de layout de tabela

**Files:**
- Create: `src/lib/cnis/layouts.ts`
- Modify: `src/lib/cnis/types.ts` (só acrescenta `NaturezaVinculo`)
- Test: `src/lib/cnis/layouts.test.ts`

**Interfaces:**
- Consumes: `mapearColunas` e `Coluna` de `./table`; `Row` de `./types`.
- Produces: `type LayoutDetectado = { natureza: NaturezaVinculo; colunas: Coluna[] }`; `function detectarLayout(cabecalho: Row): LayoutDetectado | null`; `const NOMES_LAYOUT: Record<NaturezaVinculo, string[]>`.

**Nota de ordem:** `NaturezaVinculo` vive em `types.ts`, não aqui, para não criar ciclo de
importação entre `types.ts` e `layouts.ts`. Esta task adiciona o tipo a `types.ts` antes
de criar `layouts.ts`:

```ts
/**
 * A natureza do vínculo é decidida pelo LAYOUT DA TABELA, não pelo `Tipo Filiado no
 * Vínculo`: "Contribuinte Individual" aparece tanto em recolhimento próprio quanto em
 * prestação de serviço, e os dois têm colunas diferentes. O tipo de filiado serve de
 * conferência, nunca de fonte da verdade.
 */
export type NaturezaVinculo = 'CLT' | 'CI_PRESTADOR' | 'CI_PROPRIO';
```

- [ ] **Step 1: Write the failing test**

Crie `src/lib/cnis/layouts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectarLayout } from './layouts';
import type { Row, TextItem } from './types';

/** Monta uma Row a partir dos rótulos, espaçando-os em x de 100 em 100. */
function cabecalho(...nomes: string[]): Row {
  const items: TextItem[] = nomes.map((str, i) => ({ page: 1, x: 100 + i * 100, y: 500, str }));
  return { page: 1, y: 500, items };
}

const CLT = ['Competência', 'Remuneração', 'Indicadores'];
const PROPRIO = ['Competência', 'Data Pgto.', 'Contribuição', 'Salário Contribuição', 'Indicadores'];
const PRESTADOR = [
  'Competência', 'Contrat.', 'Estabelecimento', 'Tomador', 'Forma Prestação Serviço',
  'Remuneração', 'Indicadores',
];

describe('detectarLayout', () => {
  it('reconhece a tabela CLT em 3 grupos e numera os grupos', () => {
    const detectado = detectarLayout(cabecalho(...CLT, ...CLT, ...CLT));
    expect(detectado?.natureza).toBe('CLT');
    expect(detectado?.colunas).toHaveLength(9);
    expect(detectado?.colunas.map((c) => c.grupo)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('reconhece a tabela de recolhimento próprio em 2 grupos', () => {
    const detectado = detectarLayout(cabecalho(...PROPRIO, ...PROPRIO));
    expect(detectado?.natureza).toBe('CI_PROPRIO');
    expect(detectado?.colunas).toHaveLength(10);
    expect(detectado?.colunas[2].nome).toBe('Contribuição');
    expect(detectado?.colunas[7].grupo).toBe(1);
  });

  it('reconhece a tabela de prestador de serviço em 1 grupo', () => {
    const detectado = detectarLayout(cabecalho(...PRESTADOR));
    expect(detectado?.natureza).toBe('CI_PRESTADOR');
    expect(detectado?.colunas).toHaveLength(7);
    expect(detectado?.colunas.map((c) => c.nome)).toEqual(PRESTADOR);
  });

  it('devolve null para cabeçalho desconhecido', () => {
    expect(detectarLayout(cabecalho('Competência', 'Salário', 'Outra'))).toBeNull();
  });

  it('devolve null para cabeçalho vazio', () => {
    expect(detectarLayout({ page: 1, y: 0, items: [] })).toBeNull();
  });

  it('não confunde layouts: 7 colunas não casam com o layout CLT de 3', () => {
    expect(detectarLayout(cabecalho(...PRESTADOR))?.natureza).not.toBe('CLT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cnis/layouts.test.ts`
Expected: FAIL — `Failed to resolve import "./layouts"`.

- [ ] **Step 3: Write minimal implementation**

Crie `src/lib/cnis/layouts.ts`:

```ts
import { mapearColunas, type Coluna } from './table';
import type { NaturezaVinculo, Row } from './types';

export type LayoutDetectado = { natureza: NaturezaVinculo; colunas: Coluna[] };

/** Rótulos exatos de cada layout, na ordem em que o CNIS os publica. */
export const NOMES_LAYOUT: Record<NaturezaVinculo, string[]> = {
  CLT: ['Competência', 'Remuneração', 'Indicadores'],
  CI_PROPRIO: ['Competência', 'Data Pgto.', 'Contribuição', 'Salário Contribuição', 'Indicadores'],
  CI_PRESTADOR: [
    'Competência',
    'Contrat.',
    'Estabelecimento',
    'Tomador',
    'Forma Prestação Serviço',
    'Remuneração',
    'Indicadores',
  ],
};

/**
 * Ordem de tentativa do mais específico para o menos: um cabeçalho de 7 colunas não casa
 * com o layout de 3 (7 % 3 !== 0), então não há ambiguidade, mas manter a ordem explícita
 * documenta a intenção caso um layout novo apareça.
 */
const ORDEM: NaturezaVinculo[] = ['CI_PRESTADOR', 'CI_PROPRIO', 'CLT'];

export function detectarLayout(cabecalho: Row): LayoutDetectado | null {
  for (const natureza of ORDEM) {
    const colunas = mapearColunas(cabecalho, NOMES_LAYOUT[natureza]);
    if (colunas) return { natureza, colunas };
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cnis/layouts.test.ts` → Expected: PASS, 6 testes.
Run: `npm test` → Expected: PASS, suíte inteira (nada consome `layouts.ts` ainda).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cnis/layouts.ts src/lib/cnis/layouts.test.ts src/lib/cnis/types.ts
git commit -m "feat: detecta os tres layouts de tabela do CNIS

A natureza do vinculo vem do layout da tabela, nao do Tipo Filiado no
Vinculo: 'Contribuinte Individual' aparece tanto em recolhimento proprio
quanto em prestacao de servico, com colunas diferentes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos e classificação por natureza

Substitui `ignorados` por `Vinculo.natureza`. **Ainda não lê** as linhas dos layouts novos — os vínculos não-CLT passam a existir em `vinculos` com a lista de competências vazia. Isolar assim mantém o diff legível: esta task move o modelo, as duas seguintes preenchem o dado.

**Files:**
- Modify: `src/lib/cnis/types.ts`
- Modify: `src/lib/cnis/parse-cnis.ts`
- Modify: `src/lib/cnis/index.ts`
- Modify: `src/components/upload-cnis.tsx` (linhas 121, 134, 144-147)
- Test: `src/lib/cnis/parse-cnis.test.ts` (migrar asserções existentes)

**Interfaces:**
- Consumes: `detectarLayout`, `NaturezaVinculo`, `LayoutDetectado` de `./layouts` (Task 1).
- Produces: `type Contribuicao = { competencia: string; dataPgto?: string; contribuicaoCentavos: number; salarioContribuicaoCentavos: number; indicadores: string[] }`; `type VinculoRemunerado`, `type VinculoContribuinte`, união `type Vinculo`; `CnisExtrato = { filiado: Filiado; geradoEm?: string; vinculos: Vinculo[] }`; `WarningCode` ganha `'NATUREZA_INDEFINIDA'` e `'NATUREZA_DIVERGENTE'`.

- [ ] **Step 1: Write the failing test**

Em `src/lib/cnis/parse-cnis.test.ts`, **substitua** o teste da linha 22 (`'devolve os 2 vínculos CLT e registra os 3 ignorados'`) por:

```ts
  it('devolve os 5 vínculos com a natureza de cada um', () => {
    const { extrato } = montarExtrato(itens);
    expect(extrato.vinculos.map((v) => [v.seq, v.natureza])).toEqual([
      [1, 'CLT'],
      [2, 'CI_PROPRIO'],
      [3, 'CI_PROPRIO'],
      [4, 'CLT'],
      [5, 'CI_PRESTADOR'],
    ]);
  });

  it('o tipo de filiado confere com a natureza detectada, sem divergência', () => {
    const { extrato, warnings } = montarExtrato(itens);
    const porSeq = new Map(extrato.vinculos.map((v) => [v.seq, v]));
    expect(porSeq.get(1)!.tipoFiliado).toBe('Empregado ou Agente Público');
    expect(porSeq.get(2)!.tipoFiliado).toBe('Contribuinte Individual');
    expect(porSeq.get(5)!.tipoFiliado).toBe('Contribuinte Individual');
    expect(warnings.filter((w) => w.codigo === 'NATUREZA_DIVERGENTE')).toEqual([]);
    expect(warnings.filter((w) => w.codigo === 'NATUREZA_INDEFINIDA')).toEqual([]);
  });
```

**Agora a parte que quebra em silêncio se for esquecida.** Hoje `extrato.vinculos` tem 2
entradas e `vinculos[1]` é o seq 4. Depois desta task tem 5, e `vinculos[1]` passa a ser o
seq **2**. As asserções por índice continuariam compilando e afirmariam contra o vínculo
errado. Acrescente no topo do arquivo de teste:

```ts
import type { CnisExtrato, VinculoRemunerado } from './types';

/** Busca por seq, não por índice: a ordem e o tamanho de `vinculos` mudaram na F1.5. */
function remunerado(extrato: CnisExtrato, seq: number): VinculoRemunerado {
  const v = extrato.vinculos.find((x) => x.seq === seq);
  if (!v) throw new Error(`vínculo ${seq} não encontrado`);
  if (v.natureza === 'CI_PROPRIO') throw new Error(`vínculo ${seq} não tem remunerações`);
  return v;
}
```

E converta **todos** os acessos por índice (verificados em `rtk grep -n 'vinculos\['`):

| Linha atual | Era | Passa a ser |
|---|---|---|
| 42 | `extrato.vinculos[1].codigoEmp` | `remunerado(extrato, 4).codigoEmp` |
| 43 | `extrato.vinculos[1].origem` | `remunerado(extrato, 4).origem` |
| 44 | `extrato.vinculos[1].matricula` | `remunerado(extrato, 4).matricula` |
| 60 | `extrato.vinculos[0].remuneracoes[indice]` | `remunerado(extrato, 1).remuneracoes[indice]` |
| 66 | `const v4 = extrato.vinculos[1]` | `const v4 = remunerado(extrato, 4)` |
| 77 | `extrato.vinculos[1].indicadores` | `remunerado(extrato, 4).indicadores` |
| 78 | `extrato.vinculos[0]` | `remunerado(extrato, 1)` |
| 117 | `e.vinculos[0].remuneracoes` | `remunerado(e, 1).remuneracoes` |
| 126 | `e.vinculos[0].remuneracoes` | `remunerado(e, 1).remuneracoes` |
| 187 | `e.vinculos[0].remuneracoes` | `remunerado(e, 1).remuneracoes` |

As linhas 49-51 e 67-73 usam `v1` e `v4` já capturados — basta que a captura passe pelo
helper.

E nas linhas 136, 149, 156 e 176, troque `e.ignorados.map((v) => v.seq)).toEqual([2, 3, 5])` por:

```ts
    expect(e.vinculos.filter((v) => v.natureza !== 'CLT').map((v) => v.seq)).toEqual([2, 3, 5]);
```

e na 176, `e.ignorados.every((v) => v.seq > 0)` por `e.vinculos.every((v) => v.seq > 0)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cnis/parse-cnis.test.ts`
Expected: FAIL — erro de tipo em `v.natureza` (propriedade inexistente) e os testes novos falhando com `extrato.vinculos` de tamanho 2.

- [ ] **Step 3: Write minimal implementation**

**3a.** Em `src/lib/cnis/types.ts`, substitua os tipos `Vinculo`, `VinculoIgnorado`, `CnisExtrato` e `WarningCode` por:

```ts
/** Linha das tabelas CLT e de prestador de serviço: só a remuneração. */
export type Remuneracao = {
  /** "MM/AAAA"; MM pode ser 13 (gratificação natalina). */
  competencia: string;
  valorCentavos: number;
  indicadores: string[];
};

/**
 * Linha da tabela de recolhimento próprio. Traz DUAS cifras, e a primeira é o valor
 * efetivamente pago — diferente de CLT e prestador, onde só há a remuneração e o desconto
 * tem que ser estimado.
 */
export type Contribuicao = {
  competencia: string;
  dataPgto?: string;
  contribuicaoCentavos: number;
  salarioContribuicaoCentavos: number;
  indicadores: string[];
};

type VinculoBase = {
  seq: number;
  nit?: string;
  /** Pode ser CNPJ ("12.345.678/0001-95") ou código CEI/CNO ("98.765.432"). String opaca. */
  codigoEmp?: string;
  origem?: string;
  matricula?: string;
  tipoFiliado: string;
  dataInicio?: string;
  dataFim?: string;
  ultRemun?: string;
  /** Indicadores de nível de vínculo (ex.: "IREM-INDPEND"). Ausente quando não há. */
  indicadores?: string[];
};

export type VinculoRemunerado = VinculoBase & {
  natureza: 'CLT' | 'CI_PRESTADOR';
  remuneracoes: Remuneracao[];
};

export type VinculoContribuinte = VinculoBase & {
  natureza: 'CI_PROPRIO';
  contribuicoes: Contribuicao[];
};

/** União discriminada por `natureza`: a F2 percorre as camadas com switch exaustivo. */
export type Vinculo = VinculoRemunerado | VinculoContribuinte;

export type CnisExtrato = {
  filiado: Filiado;
  geradoEm?: string;
  vinculos: Vinculo[];
};

export type WarningCode =
  | 'LAYOUT_DESCONHECIDO'
  | 'CELULA_ORFA'
  | 'COMPETENCIA_DUPLICADA'
  /** Vínculo sem tabela de competências: a natureza foi inferida do tipo de filiado. */
  | 'NATUREZA_INDEFINIDA'
  /** O layout da tabela e o tipo de filiado discordam. O layout vence; o aviso registra. */
  | 'NATUREZA_DIVERGENTE';
```

Remova inteiramente `export type VinculoIgnorado`. Mantenha `TIPO_FILIADO_CLT`, `Filiado`, `TextItem`, `Row`, `ParseWarning`, `ParseResult`, `ErroCode` e `CnisParseError` como estão.

**3b.** Em `src/lib/cnis/parse-cnis.ts`:

Troque a importação de `mapearColunas` por `detectarLayout`, e acrescente os tipos novos:

```ts
import { detectarLayout, type NaturezaVinculo } from './layouts';
import { celulasPorGrupo, colunasDoCabecalho, parseValorCentavos, type Coluna } from './table';
import {
  CnisParseError,
  TIPO_FILIADO_CLT,
  type CnisExtrato,
  type Contribuicao,
  type ParseResult,
  type ParseWarning,
  type Remuneracao,
  type Row,
  type TextItem,
  type Vinculo,
} from './types';
```

Remova a constante `COLUNAS_REMUNERACAO` (agora vive em `layouts.ts`) e o conjunto `TIPOS_NAO_CLT` deixa de decidir destino — passa a servir só de conferência:

```ts
const TIPOS_CLT: ReadonlySet<string> = new Set([TIPO_FILIADO_CLT]);
/** Grafias de tipo de filiado que o CNIS usa fora do RGPS-empregado. Só conferência. */
const TIPOS_NAO_CLT: ReadonlySet<string> = new Set([
  'Contribuinte Individual',
  'Trabalhador Avulso',
  'Segurado Facultativo',
  'Segurado Especial',
  'Facultativo',
]);

/**
 * A natureza só é conhecida no cabeçalho da TABELA, que vem depois da linha do vínculo.
 * Então o vínculo é construído mutável, com as duas listas, e finalizado na união no fim
 * da varredura.
 */
type EmConstrucao = {
  seq: number;
  nit?: string;
  codigoEmp?: string;
  origem?: string;
  matricula?: string;
  tipoFiliado: string;
  dataInicio?: string;
  dataFim?: string;
  ultRemun?: string;
  indicadores?: string[];
  natureza: NaturezaVinculo | null;
  pagina: number;
  remuneracoes: Remuneracao[];
  contribuicoes: Contribuicao[];
};

/** Fallback quando o vínculo não tem tabela: o tipo de filiado é o que resta. */
const naturezaPeloTipo = (tipoFiliado: string): NaturezaVinculo =>
  TIPOS_CLT.has(tipoFiliado) ? 'CLT' : 'CI_PROPRIO';

function finalizar(v: EmConstrucao): Vinculo {
  const { natureza, pagina: _pagina, remuneracoes, contribuicoes, ...base } = v;
  const definida = natureza ?? naturezaPeloTipo(v.tipoFiliado);
  return definida === 'CI_PROPRIO'
    ? { ...base, natureza: 'CI_PROPRIO', contribuicoes }
    : { ...base, natureza: definida, remuneracoes };
}
```

Em `montarExtrato`, troque a declaração do extrato e a variável de vínculo:

```ts
  const extrato: CnisExtrato = { filiado: {}, vinculos: [] };
  const construindo: EmConstrucao[] = [];
  const warnings: ParseWarning[] = [];
  let estado: Estado = { nome: 'inicio' };
  let vinculo: EmConstrucao | null = null;
  let pendente: { vinculo: EmConstrucao; pagina: number } | null = null;
```

Em `fecharPendente()`, todo vínculo reconhecido passa a entrar em `construindo` — não existe mais destino "ignorado":

```ts
  const fecharPendente = () => {
    if (!pendente) return;
    const { vinculo: novo, pagina } = pendente;
    pendente = null;
    const tipoFiliado = normalizarTipo(novo.tipoFiliado);
    novo.tipoFiliado = tipoFiliado;
    if (TIPOS_CLT.has(tipoFiliado) || TIPOS_NAO_CLT.has(tipoFiliado)) {
      vinculo = novo;
      construindo.push(novo);
    } else {
      warnings.push({
        codigo: 'LAYOUT_DESCONHECIDO',
        pagina,
        seq: novo.seq,
        detalhe: `Tipo de filiado não reconhecido: "${tipoFiliado}". O vínculo ${novo.seq} não foi considerado; confira o extrato.`,
      });
    }
  };
```

No estado `aguardando-cabecalho-tabela`, use `detectarLayout` e grave a natureza no vínculo, conferindo contra o tipo de filiado:

```ts
    if (estado.nome === 'aguardando-cabecalho-tabela') {
      const detectado = detectarLayout(linha);
      if (!detectado) {
        avisar('LAYOUT_DESCONHECIDO', linha.page, `Cabeçalho de tabela não reconhecido: "${linha.items.map((i) => i.str).join(' | ')}"`);
        estado = { nome: 'pulando' };
        continue;
      }
      if (vinculo) {
        vinculo.natureza = detectado.natureza;
        const ehCLT = TIPOS_CLT.has(vinculo.tipoFiliado);
        if (ehCLT !== (detectado.natureza === 'CLT')) {
          avisar(
            'NATUREZA_DIVERGENTE',
            linha.page,
            `Layout de tabela ${detectado.natureza} com tipo de filiado "${vinculo.tipoFiliado}". O layout prevalece.`,
          );
        }
      }
      estado = { nome: 'tabela', colunas: detectado.colunas };
      continue;
    }
```

O estado `'rotulo-secao'` continua `vinculo ? 'aguardando-cabecalho-tabela' : 'pulando'` — mas agora `vinculo` está preenchido também para os não-CLT, então os cabeçalhos novos passam a ser examinados.

Ajuste `construirVinculo` para devolver `EmConstrucao`:

```ts
function construirVinculo(celulas: Record<string, string>, pagina: number): EmConstrucao {
  const vinculo: EmConstrucao = {
    seq: 0,
    tipoFiliado: '',
    natureza: null,
    pagina,
    remuneracoes: [],
    contribuicoes: [],
  };
  // ... o switch existente sobre CAMPOS_VINCULO permanece idêntico ...
  return vinculo;
}
```

e a chamada vira `construirVinculo(celulas, linha.page)`. Troque também a assinatura de `acrescentarIndicadores(vinculo: Vinculo, ...)` para `acrescentarIndicadores(vinculo: EmConstrucao, ...)`, e o tipo de `CAMPOS_VINCULO` de `Record<string, keyof Vinculo>` para `Record<string, keyof EmConstrucao>`.

Por fim, antes do `return`, finalize e emita `NATUREZA_INDEFINIDA` para quem ficou sem tabela:

```ts
  fecharPendente();
  for (const v of construindo) {
    if (v.natureza === null) {
      warnings.push({
        codigo: 'NATUREZA_INDEFINIDA',
        pagina: v.pagina,
        seq: v.seq,
        detalhe: `Vínculo ${v.seq} ("${v.tipoFiliado}") não tem tabela de competências; natureza inferida do tipo de filiado.`,
      });
    }
  }
  extrato.vinculos = construindo.map(finalizar);
  return { extrato, warnings };
```

`lerLinhaDaTabela` ainda só entende o layout CLT; nesta task ela passa a receber `EmConstrucao` em vez de `Vinculo` e permanece com a lógica atual. As Tasks 3 e 4 a dividem.

**3d.** Em `src/components/upload-cnis.tsx`, o campo `extrato.ignorados` deixou de existir.
Quem remove o campo conserta quem o usava, no mesmo commit — nenhuma task deixa o build
quebrado.

Linha 121, a contagem de competências precisa somar as duas listas:

```tsx
  const competencias = extrato.vinculos.reduce(
    (total, v) => total + (v.natureza === 'CI_PROPRIO' ? v.contribuicoes.length : v.remuneracoes.length),
    0,
  );
```

Linha 134, troque a métrica de vínculos ignorados por uma de naturezas:

```tsx
          ['Vínculos lidos', String(extrato.vinculos.length)],
          ['Vínculos não-CLT', String(extrato.vinculos.filter((v) => v.natureza !== 'CLT').length)],
```

Linhas 144-147, substitua o aviso de "não considerados" — eles agora são considerados:

```tsx
      {extrato.vinculos.some((v) => v.natureza !== 'CLT') && (
        <p className="...">
          {extrato.vinculos.filter((v) => v.natureza !== 'CLT').length} vínculo(s) de
          contribuinte individual lido(s) (
          {extrato.vinculos
            .filter((v) => v.natureza !== 'CLT')
            .map((v) => `${v.seq}: ${v.tipoFiliado}`)
            .join('; ')}
          ). O cálculo de teto considera todos eles.
        </p>
      )}
```

Mantenha as classes `className` que já estão no arquivo — só o conteúdo muda.


**3c.** Em `src/lib/cnis/index.ts`, remova `VinculoIgnorado` da lista de tipos exportados e acrescente os novos:

```ts
export { parseCnis, montarExtrato } from './parse-cnis';
export { CnisParseError, TIPO_FILIADO_CLT } from './types';
export { detectarLayout, NOMES_LAYOUT } from './layouts';
export type {
  CnisExtrato,
  Contribuicao,
  ErroCode,
  Filiado,
  NaturezaVinculo,
  ParseResult,
  ParseWarning,
  Remuneracao,
  Vinculo,
  VinculoContribuinte,
  VinculoRemunerado,
  WarningCode,
} from './types';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cnis/parse-cnis.test.ts` → Expected: PASS.
Run: `npx tsc --noEmit` → Expected: **zero erros**. Nenhuma task deixa o build quebrado.
Run: `npm run lint` → Expected: zero erros.
Run: `npm test` → Expected: PASS, suíte inteira.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cnis/types.ts src/lib/cnis/parse-cnis.ts src/lib/cnis/index.ts src/lib/cnis/parse-cnis.test.ts src/components/upload-cnis.tsx
git commit -m "refactor: vinculo ganha natureza; ignorados sai do modelo

Os cinco vinculos do extrato passam a existir em \`vinculos\`, cada um com
a natureza vinda do layout da tabela. O tipo de filiado passa a ser
conferencia: divergencia entre layout e tipo emite NATUREZA_DIVERGENTE e
o layout prevalece.

As tabelas dos layouts novos ainda nao sao lidas: as proximas duas tasks
preenchem o dado. upload-cnis.tsx e ajustado no mesmo commit, porque quem
remove o campo conserta quem o usava.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Ler a tabela de prestador de serviço (`CI_PRESTADOR`)

O layout tem 7 colunas e um só grupo, mas a cifra que interessa está em `Remuneração` — igual ao caso CLT. A diferença é o nome da coluna e a presença de `Tomador` e `Forma Prestação Serviço`.

**Files:**
- Modify: `src/lib/cnis/parse-cnis.ts`
- Test: `src/lib/cnis/parse-cnis.test.ts`

**Interfaces:**
- Consumes: `EmConstrucao`, `celulasPorGrupo`, `parseValorCentavos` (Task 2).
- Produces: `lerLinhaRemuneracao(linha, colunas, vinculo, nomeDaCifra, avisar)` — usada também pelo caminho CLT.

- [ ] **Step 1: Write the failing test**

Acrescente em `src/lib/cnis/parse-cnis.test.ts`:

```ts
  it('lê as 17 competências do vínculo 5 (prestador de serviço)', () => {
    const { extrato } = montarExtrato(itens);
    const v5 = extrato.vinculos.find((v) => v.seq === 5)!;
    expect(v5.natureza).toBe('CI_PRESTADOR');
    if (v5.natureza === 'CI_PROPRIO') throw new Error('natureza inesperada');
    expect(v5.remuneracoes).toHaveLength(17);
    expect(v5.remuneracoes[0]).toEqual({
      competencia: '06/2015',
      valorCentavos: 10000,
      indicadores: [],
    });
    expect(v5.remuneracoes.at(-1)).toEqual({
      competencia: '10/2016',
      valorCentavos: 372343,
      indicadores: [],
    });
    expect(v5.remuneracoes.find((r) => r.competencia === '07/2015')!.valorCentavos).toBe(486534);
    expect(v5.remuneracoes.filter((r) => r.valorCentavos === 392000)).toHaveLength(11);
  });

  it('06/2015 tem vínculo CLT e prestador ao mesmo tempo', () => {
    const { extrato } = montarExtrato(itens);
    const naCompetencia = extrato.vinculos.filter(
      (v) => v.natureza !== 'CI_PROPRIO' && v.remuneracoes.some((r) => r.competencia === '06/2015'),
    );
    expect(naCompetencia.map((v) => [v.seq, v.natureza])).toEqual([
      [4, 'CLT'],
      [5, 'CI_PRESTADOR'],
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cnis/parse-cnis.test.ts -t 'prestador'`
Expected: FAIL — `expected [] to have length 17`.

- [ ] **Step 3: Write minimal implementation**

Em `src/lib/cnis/parse-cnis.ts`, generalize `lerLinhaDaTabela` para receber o nome da coluna da cifra, e despache por natureza no estado `tabela`.

Substitua a função `lerLinhaDaTabela` por:

```ts
/**
 * Grupos da linha que têm competência válida. Os demais são conferidos: fragmento de
 * cabeçalho repetido pode ser descartado, mas célula com cara de dado fora da coluna
 * esperada não pode evaporar.
 */
function gruposComDado(
  linha: Row,
  colunas: Coluna[],
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): Array<Record<string, string>> {
  const grupos = celulasPorGrupo(linha, colunas);
  const comCompetencia = grupos.filter((g) => COMPETENCIA.test(g['Competência'] ?? ''));
  for (const grupo of grupos) {
    if (comCompetencia.includes(grupo)) continue;
    const texto = Object.values(grupo).join(' ');
    if (PARECE_COMPETENCIA.test(texto) || PARECE_VALOR.test(texto)) {
      avisar('CELULA_ORFA', linha.page, `Linha da tabela com dado fora da coluna esperada: "${texto}"`);
    }
  }
  return comCompetencia;
}

/** CLT e CI_PRESTADOR: uma cifra só, na coluna "Remuneração". */
function lerLinhaRemuneracao(
  linha: Row,
  colunas: Coluna[],
  vinculo: EmConstrucao,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  for (const grupo of gruposComDado(linha, colunas, avisar)) {
    const competencia = grupo['Competência'];
    const valorCentavos = parseValorCentavos(grupo['Remuneração'] ?? '');

    if (valorCentavos === null) {
      avisar('CELULA_ORFA', linha.page, `Competência ${competencia} sem remuneração legível (lido: "${grupo['Remuneração'] ?? ''}")`);
      continue;
    }
    if (vinculo.remuneracoes.some((r) => r.competencia === competencia)) {
      avisar('COMPETENCIA_DUPLICADA', linha.page, `Competência ${competencia} aparece mais de uma vez no vínculo`);
    }

    vinculo.remuneracoes.push({
      competencia,
      valorCentavos,
      indicadores: separarIndicadores(grupo['Indicadores'] ?? ''),
    });
  }
}
```

E no laço principal, substitua o bloco do estado `tabela` por:

```ts
    if (estado.nome === 'tabela' && vinculo) {
      if (vinculo.natureza === 'CI_PROPRIO') {
        // Task 4 implementa este caminho.
        continue;
      }
      lerLinhaRemuneracao(linha, estado.colunas, vinculo, avisar);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cnis/parse-cnis.test.ts` → Expected: PASS.

Se `v5.remuneracoes` vier com 17 itens mas valores errados, imprima o mapeamento antes de ajustar — a linha do prestador tem 5 células sob 7 colunas (`Tomador` vem vazio), então a atribuição por x precisa de conferência:

```bash
npx tsx -e "
const { montarExtrato } = require('./src/lib/cnis/parse-cnis.ts');
const itens = require('./src/lib/cnis/__fixtures__/extrato-exemplo.textlayer.json');
const v5 = montarExtrato(itens).extrato.vinculos.find(v => v.seq === 5);
console.log(JSON.stringify(v5.remuneracoes.slice(0, 3), null, 2));
"
```

Os valores esperados, lidos da fixture: `06/2015 → 100,00`, `07/2015 → 4.865,34`, `08/2015 → 3.920,00`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cnis/parse-cnis.ts src/lib/cnis/parse-cnis.test.ts
git commit -m "feat: le a tabela de prestador de servico do contribuinte individual

As 17 competencias do vinculo 5 deixam de ser descartadas. E a fixture
revela 06/2015 com CLT e prestador simultaneos — a pendencia da F1 dizia
que nao havia sobreposicao, o que vale para CLT+CLT mas nao no geral.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Ler a tabela de recolhimento próprio (`CI_PROPRIO`)

Duas cifras por linha: `Contribuição` (o valor efetivamente pago) e `Salário Contribuição` (a base). É o único layout em que o CNIS informa o que foi pago.

**Files:**
- Modify: `src/lib/cnis/parse-cnis.ts`
- Test: `src/lib/cnis/parse-cnis.test.ts`

**Interfaces:**
- Consumes: `gruposComDado`, `EmConstrucao`, `Contribuicao` (Tasks 2 e 3).
- Produces: `lerLinhaContribuicao(linha, colunas, vinculo, avisar)`.

- [ ] **Step 1: Write the failing test**

Acrescente em `src/lib/cnis/parse-cnis.test.ts`:

```ts
  it('lê as contribuições do vínculo 2 com as duas cifras', () => {
    const { extrato } = montarExtrato(itens);
    const v2 = extrato.vinculos.find((v) => v.seq === 2)!;
    expect(v2.natureza).toBe('CI_PROPRIO');
    if (v2.natureza !== 'CI_PROPRIO') throw new Error('natureza inesperada');
    expect(v2.contribuicoes).toHaveLength(5);
    expect(v2.contribuicoes[0]).toEqual({
      competencia: '10/2010',
      dataPgto: '22/09/2011',
      contribuicaoCentavos: 5225,
      salarioContribuicaoCentavos: 104500,
      indicadores: ['IREC-LC123', 'IREC-MEI'],
    });
    expect(v2.contribuicoes.map((c) => c.competencia)).toEqual([
      '10/2010', '11/2010', '12/2010', '01/2011', '02/2011',
    ]);
  });

  it('lê as 14 contribuições do vínculo 3', () => {
    const { extrato } = montarExtrato(itens);
    const v3 = extrato.vinculos.find((v) => v.seq === 3)!;
    if (v3.natureza !== 'CI_PROPRIO') throw new Error('natureza inesperada');
    expect(v3.contribuicoes).toHaveLength(14);
    expect(v3.contribuicoes.at(-1)).toEqual({
      competencia: '11/2012',
      dataPgto: '12/12/2012',
      contribuicaoCentavos: 6060,
      salarioContribuicaoCentavos: 121200,
      indicadores: ['IREC-LC123', 'IREC-MEI'],
    });
  });

  it('a competência 01/2011 vem sem indicadores e com base proporcional', () => {
    const { extrato } = montarExtrato(itens);
    const v2 = extrato.vinculos.find((v) => v.seq === 2)!;
    if (v2.natureza !== 'CI_PROPRIO') throw new Error('natureza inesperada');
    const c = v2.contribuicoes.find((x) => x.competencia === '01/2011')!;
    expect(c).toEqual({
      competencia: '01/2011',
      dataPgto: '16/06/2015',
      contribuicaoCentavos: 3020,
      salarioContribuicaoCentavos: 60400,
      indicadores: [],
    });
  });

  it('toda contribuição lida é inteira em centavos', () => {
    const { extrato } = montarExtrato(itens);
    for (const v of extrato.vinculos) {
      if (v.natureza !== 'CI_PROPRIO') continue;
      for (const c of v.contribuicoes) {
        expect(Number.isInteger(c.contribuicaoCentavos)).toBe(true);
        expect(Number.isInteger(c.salarioContribuicaoCentavos)).toBe(true);
      }
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cnis/parse-cnis.test.ts -t 'contribuiç'`
Expected: FAIL — `expected [] to have length 5`.

- [ ] **Step 3: Write minimal implementation**

Em `src/lib/cnis/parse-cnis.ts`, acrescente:

```ts
/** CI_PROPRIO: duas cifras por linha. `Contribuição` é o valor PAGO, não uma estimativa. */
function lerLinhaContribuicao(
  linha: Row,
  colunas: Coluna[],
  vinculo: EmConstrucao,
  avisar: (codigo: ParseWarning['codigo'], pagina: number, detalhe: string) => void,
): void {
  for (const grupo of gruposComDado(linha, colunas, avisar)) {
    const competencia = grupo['Competência'];
    const contribuicaoCentavos = parseValorCentavos(grupo['Contribuição'] ?? '');
    const salarioContribuicaoCentavos = parseValorCentavos(grupo['Salário Contribuição'] ?? '');

    // As duas cifras são obrigatórias: sem a base não há como conferir a alíquota, e sem o
    // valor pago não há o que restituir. Faltando uma, o dado não entra meio lido.
    if (contribuicaoCentavos === null || salarioContribuicaoCentavos === null) {
      avisar(
        'CELULA_ORFA',
        linha.page,
        `Competência ${competencia} sem as duas cifras legíveis (contribuição: "${grupo['Contribuição'] ?? ''}", salário de contribuição: "${grupo['Salário Contribuição'] ?? ''}")`,
      );
      continue;
    }
    if (vinculo.contribuicoes.some((c) => c.competencia === competencia)) {
      avisar('COMPETENCIA_DUPLICADA', linha.page, `Competência ${competencia} aparece mais de uma vez no vínculo`);
    }

    const contribuicao: Contribuicao = {
      competencia,
      contribuicaoCentavos,
      salarioContribuicaoCentavos,
      indicadores: separarIndicadores(grupo['Indicadores'] ?? ''),
    };
    const dataPgto = (grupo['Data Pgto.'] ?? '').trim();
    if (dataPgto !== '') contribuicao.dataPgto = dataPgto;

    vinculo.contribuicoes.push(contribuicao);
  }
}
```

E troque o bloco do estado `tabela` por:

```ts
    if (estado.nome === 'tabela' && vinculo) {
      if (vinculo.natureza === 'CI_PROPRIO') {
        lerLinhaContribuicao(linha, estado.colunas, vinculo, avisar);
      } else {
        lerLinhaRemuneracao(linha, estado.colunas, vinculo, avisar);
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cnis/parse-cnis.test.ts` → Expected: PASS.

Conferência de sanidade da alíquota, por multiplicação cruzada inteira (5% = 500 pontos-base):

```bash
npx tsx -e "
const { montarExtrato } = require('./src/lib/cnis/parse-cnis.ts');
const itens = require('./src/lib/cnis/__fixtures__/extrato-exemplo.textlayer.json');
for (const v of montarExtrato(itens).extrato.vinculos) {
  if (v.natureza !== 'CI_PROPRIO') continue;
  for (const c of v.contribuicoes) {
    const esperado = Math.floor((c.salarioContribuicaoCentavos * 500 + 5000) / 10000);
    const ok = Math.abs(c.contribuicaoCentavos - esperado) <= 1;
    if (!ok) console.log('DIVERGE', v.seq, c.competencia, c.contribuicaoCentavos, esperado);
  }
}
console.log('conferencia de aliquota concluida');
"
```

Expected: nenhuma linha `DIVERGE` — todas as contribuições da fixture são MEI a 5%.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cnis/parse-cnis.ts src/lib/cnis/parse-cnis.test.ts
git commit -m "feat: le a tabela de recolhimento proprio com as duas cifras

Contribuicao (valor pago) e Salario Contribuicao (base). E o unico layout
em que o CNIS informa o que foi pago, em vez de so a remuneracao — a F2
trata esse valor como leitura, nao estimativa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Integridade por vínculo

Fecha a fase com uma asserção que pega perda silenciosa de dado sem precisar prever a
causa. A UI já foi ajustada na Task 2.

**Files:**
- Test: `src/lib/cnis/parse-cnis.test.ts`

**Interfaces:**
- Consumes: a união `Vinculo` (Task 2) e as listas preenchidas (Tasks 3 e 4).
- Produces: nada novo. É a task de fechamento.

- [ ] **Step 1: Write the integrity test**

Diferente das tasks anteriores, este teste pode **passar de primeira** — ele é uma rede de
segurança sobre o que as Tasks 3 e 4 já entregaram, não a especificação de código novo. Se
passar, confirme que ele realmente exercita o caminho (mude um número esperado de
propósito, veja falhar, desfaça). Se falhar, a contagem real diz onde o dado se perdeu:
corrija o parser, nunca o número esperado.

Acrescente em `src/lib/cnis/parse-cnis.test.ts`:

```ts
  it('nenhum vínculo perde competências em silêncio', () => {
    const { extrato, warnings } = montarExtrato(itens);
    const quantidades = extrato.vinculos.map((v) => [
      v.seq,
      v.natureza === 'CI_PROPRIO' ? v.contribuicoes.length : v.remuneracoes.length,
    ]);
    expect(quantidades).toEqual([
      [1, 16],
      [2, 5],
      [3, 14],
      [4, 30],
      [5, 17],
    ]);
    expect(warnings).toEqual([]);
  });

  it('a contagem de competências bate com o intervalo de datas do vínculo', () => {
    const { extrato } = montarExtrato(itens);
    const mesesEntre = (inicio: string, fim: string): number => {
      const [, mi, ai] = inicio.split('/').map(Number);
      const [, mf, af] = fim.split('/').map(Number);
      return (af - ai) * 12 + (mf - mi) + 1;
    };
    for (const v of extrato.vinculos) {
      if (!v.dataInicio || !v.dataFim) continue;
      const lidas = v.natureza === 'CI_PROPRIO' ? v.contribuicoes.length : v.remuneracoes.length;
      // Lacunas são legítimas (mês sem recolhimento), então o teto é o limite superior.
      // Passar dele significa competência duplicada ou vazada de outro vínculo.
      expect(lidas).toBeLessThanOrEqual(mesesEntre(v.dataInicio, v.dataFim));
    }
  });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/lib/cnis/parse-cnis.test.ts -t 'silêncio'`
Expected: PASS (ver a nota do Step 1).

- [ ] **Step 3: Verificar tipos, lint e suíte**

Run: `npx tsc --noEmit` → Expected: zero erros.
Run: `npm run lint` → Expected: zero erros.
Run: `npm test` → Expected: PASS, suíte inteira.

- [ ] **Step 4: Commit**

```bash
git add src/lib/cnis/parse-cnis.test.ts
git commit -m "test: integridade de contagem por vinculo

Asserção de contagem por vinculo contra o intervalo de datas: pega perda
silenciosa de dado sem precisar prever a causa, sem ter que antecipar qual
seria.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fora do escopo desta fase

Registrado para não ser confundido com esquecimento:

- **A seção `Valores Consolidados por Ano Civil` não é lida.** É o checksum nativo do documento — traz o total mês a mês de todos os vínculos, limitado ao teto e marcado com `*` — mas na fixture os consolidados ficaram com o teto do ano **real** enquanto as competências foram deslocadas ~10 anos pela anonimização. Usá-la como oráculo exige fixture sintética onde datas e tetos concordem. É trabalho da F2, não daqui.
- **O motor de cálculo** (`src/lib/teto/`) é a F2, com plano próprio.
- **`IREC-LC123-SUP`** e **`PSC-MEN-SM`** não são interpretados, só preservados em `indicadores`.
- **Alíquota do CI** não é inferida aqui. A F2 a apura do próprio dado (`contribuicaoCentavos / salarioContribuicaoCentavos`) e usa os indicadores como conferência.
