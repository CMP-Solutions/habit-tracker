import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Load the test environment in the Vitest main process as well, so forked
// workers inherit a DATABASE_URL that points at the isolated test database
// even before setupFiles run.
loadEnv({ path: path.resolve(__dirname, ".env.test"), override: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // The route tests truncate whole tables; running test files in parallel
    // would let one file's deleteMany() race another file's assertions.
    fileParallelism: false,
  },
});
