import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Engine purity rules (SPEC-ENGINE §1).
 *
 * The engine must be a pure function of (history, date, opts). Five bans:
 * Date.now, Math.random, fetch, process.env, and host-varying locale methods.
 * These are lint-enforced rather than convention-enforced because determinism
 * is a product guarantee, not a style preference.
 */
const purityRules = {
  "no-restricted-globals": [
    "error",
    { name: "fetch", message: "engine is pure: no I/O (SPEC-ENGINE §1)" },
    { name: "process", message: "engine is pure: no env access (SPEC-ENGINE §1)" },
    { name: "XMLHttpRequest", message: "engine is pure: no I/O (SPEC-ENGINE §1)" },
    { name: "localStorage", message: "engine is pure: no I/O (SPEC-ENGINE §1)" },
    { name: "Intl", message: "engine is pure: host-varying locale data (SPEC-ENGINE §1)" },
  ],
  "no-restricted-properties": [
    "error",
    { object: "Date", property: "now", message: "date is an argument, never ambient (SPEC-ENGINE §1)" },
    { object: "Math", property: "random", message: "use the seeded PRNG (SPEC-ENGINE §3.3)" },
    { object: "process", property: "env", message: "engine is pure: no env access (SPEC-ENGINE §1)" },
    { object: "globalThis", property: "fetch", message: "engine is pure: no I/O (SPEC-ENGINE §1)" },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: "NewExpression[callee.name='Date']",
      message: "engine is pure: derive time from the date argument (SPEC-ENGINE §1)",
    },
    {
      selector: "CallExpression[callee.object.name='Date']",
      message: "engine is pure: derive time from the date argument (SPEC-ENGINE §1)",
    },
    {
      selector: "MemberExpression[property.name=/^toLocale(String|DateString|TimeString)$/]",
      message: "toLocaleString is host-dependent; use the label tables (SPEC-ENGINE §1)",
    },
    {
      selector: "MemberExpression[property.name='localeCompare']",
      message: "localeCompare is host-dependent; sort by code unit (SPEC-ENGINE §1)",
    },
    {
      selector: "ImportDeclaration[source.value=/^(node:|fs$|path$|crypto$|http)/]",
      message: "engine has zero runtime dependencies and no I/O (SPEC-ENGINE §1)",
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.astro/**",
      "**/golden/**",
      "**/coverage/**",
      "**/debug/**",
      // Gitignored scratch: throwaway scripts live here, and a file CI never
      // sees must not be able to fail the lint gate locally.
      "**/tmp/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["engine/src/**/*.ts"],
    rules: purityRules,
  },
  {
    // Build config runs in node before any bundler exists, so it reads the
    // environment directly. `.astro` files are not linted here - `astro check`
    // typechecks them, including their client scripts.
    files: ["**/*.config.{js,mjs,ts}"],
    languageOptions: { globals: { process: "readonly" } },
  },
  {
    // Scripts and tests are ordinary programs: they read files, print, and
    // measure wall-clock time.
    files: ["**/scripts/**/*.ts", "**/test/**/*.ts", "**/*.test.ts", "**/*.bench.ts", "*.js"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
