import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    // Runs before each test file is loaded, so required env vars (e.g.
    // AMAZON_PARTNER_TAG) always have a safe fallback even when no .env
    // file is present - see test/setup.ts for details.
    setupFiles: ["test/setup.ts"],
  },
});
