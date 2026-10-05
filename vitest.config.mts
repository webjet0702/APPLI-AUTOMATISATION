import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    env: { PGLITE_DIR: "memory://" },
    // Le premier test d'un fichier démarre la base PGlite (quelques secondes).
    testTimeout: 30_000,
  },
});
