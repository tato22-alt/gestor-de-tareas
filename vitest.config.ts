import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            TELEGRAM_BOT_TOKEN: "token-de-prueba",
            TELEGRAM_WEBHOOK_SECRET: "secreto-de-prueba",
            // Con una clave real, test/escenarios.test.ts corre contra Groq (T5); sin clave se saltea.
            GROQ_API_KEY: process.env.GROQ_API_KEY ?? "clave-de-prueba",
            GROQ_REAL: process.env.GROQ_API_KEY ? "1" : "",
            ...(process.env.GROQ_MODELO && { GROQ_MODELO: process.env.GROQ_MODELO }),
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/aplicar-migraciones.ts"] },
  };
});
