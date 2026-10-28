import type { Env } from "./env";
import { manejarWebhook } from "./webhook";

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/telegram") return manejarWebhook(request, env);
    return new Response("No encontrado", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
