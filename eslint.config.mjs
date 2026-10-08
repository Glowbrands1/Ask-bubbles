import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deno source for the Supabase Edge Runtime — see tsconfig.json.
    "supabase/functions/**",
    // Playwright output (reports and traces), generated and gitignored.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
