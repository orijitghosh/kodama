import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    /**
     * The suite runs with no credentials, whatever the developer's shell holds.
     *
     * `container()` reads these, and a token in the environment turns the
     * adapter tests from an offline assertion into a live GitHub fetch for a
     * fixture login - which is how `adapters.test.ts` started failing the moment
     * a token was exported for a calibration run: the outage path it asserts
     * (503, D-034) had quietly become a real request. A test suite that behaves
     * differently depending on what is exported in the shell is not a test
     * suite, and one that reaches the network without being asked is worse.
     *
     * Anything that genuinely needs a token supplies it explicitly - the fakes
     * in `test/helpers/` do, and `recorded.test.ts` reads from disk.
     */
    env: { KODAMA_PATS: "", GITHUB_TOKEN: "", GH_TOKEN: "" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
