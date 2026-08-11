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
    // Build output of `npm run build:crazygames`. `out/` above covers the export
    // itself, but the packaging step renames it, and linting minified bundles
    // reports thousands of problems in code we did not write.
    "crazygames-build/**",
  ]),
]);

export default eslintConfig;
