# Especificação Técnica: Calculadora de Teto Previdenciário

## 1. Visão Geral do Produto
Aplicação web destinada a professores da rede privada para leitura automatizada do Extrato CNIS (Cadastro Nacional de Informações Sociais), cálculo de retenção de INSS acima do teto devido a múltiplos vínculos e geração de declaração preventiva para o RH.

**Público-alvo:** Professores da rede privada do Grande ABC.
**Objetivo principal:** Identificar meses de contribuição acima do teto nos últimos 5 anos de forma automatizada e segura, sem necessidade de senhas governamentais.

---

## 2. Requisitos Funcionais (Funcionalidades)

### F1. Upload e Processamento de CNIS (Parser)
* O sistema deve permitir o upload de um arquivo PDF gerado pelo portal "Meu INSS".
* O sistema deve extrair de forma estruturada os seguintes dados tabulares do PDF:
  * Competência (Mês/Ano).
  * CNPJ/Empregador.
  * Remuneração Bruta vinculada à competência.
  * Indicadores de erro (ex: PREM-EXT, IRE-INSS).
* O sistema deve ignorar vínculos estatutários (Regime Próprio) se houver, focando apenas no RGPS (CLT).

### F2. Motor de Cálculo de Teto
* O sistema deve agrupar as remunerações por Competência (somando os salários de todos os CNPJs num mesmo mês).
* O sistema deve comparar a soma das remunerações com a tabela histórica do Teto do INSS (hardcoded ou via banco de dados simples para os últimos 5 anos: 2021 a 2026).
* O sistema deve calcular a diferença (Remuneração Total - Teto). Se positivo, aplicar a alíquota máxima vigente no ano para estimar o valor retido a maior.
* Regra especial para o 13º salário: A gratificação natalina tem teto isolado no mês de pagamento (geralmente dezembro) e deve ser calculada separadamente da remuneração daquele mês.

### F3. Dashboard de Resultados (Visualização)
* Exibir um resumo executivo: 
  * "Meses com múltiplos vínculos identificados: X".
  * "Meses com contribuição acima do teto: Y".
  * "Estimativa de crédito acumulado: R$ Z".
* Exibir um gráfico ou tabela expansível listando o histórico ano a ano, destacando os meses onde o limite foi ultrapassado.

### F4. Gerador de Declaração de Múltiplos Vínculos
* Para usuários que atingem o teto, o sistema deve gerar um documento PDF padrão.
* O PDF deve ser preenchido automaticamente com os dados do professor (extraídos do cabeçalho do CNIS ou via input de formulário rápido).
* Texto informando a uma instituição de ensino (à escolha do professor) que o teto já é atingido em outra fonte pagadora, requerendo a suspensão do desconto.

---

## 3. Requisitos Não Funcionais (Segurança e Arquitetura)

### Privacidade e LGPD (Crucial)
* **Processamento Client-Side (Recomendado):** Para máxima segurança jurídica, o parsing do PDF deve ocorrer preferencialmente no navegador do usuário (Client-side, usando bibliotecas como `pdf.js`), sem que o arquivo trafegue para um servidor back-end. 
* Se o parsing exigir back-end (ex: Python `pdfplumber`), o arquivo PDF deve ser mantido estritamente em memória volátil, sendo descartado imediatamente após a extração dos dados (**Zero-Data Retention**).

### Stack Tecnológico Sugerido
* **Frontend:** PWA - Next.js
* **Extrator de PDF:** 
  * *Opção Client-Side:* `pdf.js` ou `pdf2json` adaptado para o browser.
  * *Opção Server-Side (API Rest):* Python com `pdfplumber` ou `PyMuPDF` (muito superiores para leitura de tabelas complexas do INSS).
* **Hospedagem:** Github + Vercel + Supabase.

---

## 4. Estrutura de Dados do Motor (Exemplo JSON)

O extrator deverá converter o PDF no seguinte objeto lógico para o cálculo:

```json
{
  "usuario": {
    "nome": "João Professor",
    "nit": "123.45678.90-1"
  },
  "competencias": [
    {
      "mesAno": "08/2024",
      "remuneracoes": [
         {"cnpj": "11.111.111/0001-11", "valor": 5000.00},
         {"cnpj": "22.222.222/0001-22", "valor": 4500.00}
      ],
      "somaTotal": 9500.00,
      "tetoVigente": 7786.02,
      "excedeuTeto": true,
      "baseExcedente": 1713.98,
      "estimativaRestituicao": 239.95
    }
  ]
}

use @extrato-exemplo.pdf como exemplo de schema.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
