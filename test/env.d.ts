import type { D1Migration } from "cloudflare:test";
import type { Env as EnvDelAsistente } from "../src/env";

declare global {
  namespace Cloudflare {
    interface Env extends EnvDelAsistente {
      TEST_MIGRATIONS: D1Migration[];
      GROQ_REAL: string;
    }
  }
}
