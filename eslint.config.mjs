import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Dinheiro na tela passa pelo componente `Dinheiro`, que exige natureza e elegibilidade
    // (§9 da spec da F2: "nunca um número sozinho"). Sem esta regra, qualquer componente
    // poderia formatar um valor solto, e o requisito voltaria a depender de alguém lembrar.
    // A camada `src/lib/apresentacao/` segue livre: lá o texto não vai para a tela.
    files: ['src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    ignores: ['src/components/dinheiro.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apresentacao/dinheiro'],
              message:
                'Formate dinheiro pelo componente Dinheiro (@/components/dinheiro), que exige natureza e elegibilidade.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worker do pdf.js copiado no postinstall (arquivo gerado, minificado).
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
