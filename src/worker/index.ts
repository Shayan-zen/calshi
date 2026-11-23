import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { type AppEnv, sessionMiddleware } from "./lib/session";
import { HttpError } from "./lib/util";
import { maybeRunBot } from "./lib/bot";
import { auth } from "./routes/auth";
import { browse } from "./routes/browse";
import { trading } from "./routes/trading";
import { comments } from "./routes/comments";
import { admin } from "./routes/admin";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
app.use("*", sessionMiddleware);

app.route("/", auth);
app.route("/", browse);
app.route("/", trading);
app.route("/", comments);
app.route("/", admin);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) {
    c.header("Cache-Control", "no-store");
    return c.json({ error: err.message }, err.status as 400);
  }
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(maybeRunBot(env.DB, 20_000).catch((e) => console.error("bot tick failed", e)));
  },
} satisfies ExportedHandler<Env>;
