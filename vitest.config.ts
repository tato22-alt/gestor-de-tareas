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
            GROQ_API_KEY: "clave-de-prueba",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/aplicar-migraciones.ts"] },
  };
});
