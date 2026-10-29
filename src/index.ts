import { alCron } from "./cron";
import type { Env } from "./env";
import { manejarWebhook } from "./webhook";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/telegram") return manejarWebhook(request, env, ctx);
    return new Response("No encontrado", { status: 404 });
  },

  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(alCron(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
