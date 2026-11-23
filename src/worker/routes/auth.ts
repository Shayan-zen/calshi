import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import {
  type AppEnv,
  createSession,
  destroySession,
  isAllowedEmail,
  resolveAdmin,
  isHttps,
  randomToken,
  toUser,
  upsertUser,
} from "../lib/session";
import { HttpError, parseBody } from "../lib/util";

const STATE_COOKIE = "oauth_state";

/** Only same-origin absolute paths ("/foo"), never "//host" or "/\host". */
function safeRedirect(r: string | undefined | null): string {
  if (!r || typeof r !== "string") return "/";
  if (!r.startsWith("/") || r.startsWith("//") || r.startsWith("/\\") || /[\r\n]/.test(r)) return "/";
  return r.slice(0, 500);
}

function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export const auth = new Hono<AppEnv>();

auth.get("/me", (c) => {
  const u = c.get("user");
  return c.json({ user: u ? toUser(u.row, u.isAdmin) : null });
});

auth.get("/auth/google", (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) throw new HttpError(500, "Google OAuth is not configured");
  const state = randomToken(24);
  const redirect = safeRedirect(c.req.query("redirect"));
  setCookie(c, STATE_COOKIE, `${state}.${encodeURIComponent(redirect)}`, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/api/auth",
    maxAge: 600,
  });
  const origin = new URL(c.req.url).origin;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: c.env.ALLOWED_EMAIL_DOMAIN,
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
});

auth.get("/auth/google/callback", async (c) => {
  const fail = (kind: "domain" | "failed") => c.redirect(`/login?auth_error=${kind}`, 302);
  const cookie = getCookie(c, STATE_COOKIE) ?? "";
  deleteCookie(c, STATE_COOKIE, { path: "/api/auth", secure: isHttps(c) });
  const dot = cookie.indexOf(".");
  const savedState = dot > 0 ? cookie.slice(0, dot) : "";
  let redirect = "/";
  try {
    redirect = safeRedirect(decodeURIComponent(cookie.slice(dot + 1)));
  } catch {
    redirect = "/";
  }
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (!savedState || !state || state !== savedState || !code) return fail("failed");

  const domain = String(c.env.ALLOWED_EMAIL_DOMAIN).toLowerCase();
  let payload: Record<string, unknown>;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${new URL(c.req.url).origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) return fail("failed");
    const tok = (await res.json()) as { id_token?: string };
    if (!tok.id_token) return fail("failed");
    // id_token came straight from Google's token endpoint over TLS: no signature check needed.
    payload = JSON.parse(b64urlDecode(tok.id_token.split(".")[1] ?? ""));
  } catch {
    return fail("failed");
  }
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (payload.email_verified !== true || !isAllowedEmail(c.env, email) || String(payload.hd ?? "").toLowerCase() !== domain) {
    return fail("domain");
  }
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email.split("@")[0];
  const picture = typeof payload.picture === "string" ? payload.picture : null;
  const row = await upsertUser(c.env.DB, email, name.slice(0, 80), picture);
  await createSession(c, row.id);
  return c.redirect(redirect, 302);
});

auth.post("/auth/dev-login", async (c) => {
  if (c.env.DEV_LOGIN !== "true") return c.json({ error: "Not found" }, 404);
  const body = await parseBody(c, z.object({ email: z.string().trim().min(3).max(200), name: z.string().trim().min(1).max(80).optional() }));
  const email = body.email.toLowerCase();
  if (!isAllowedEmail(c.env, email)) throw new HttpError(403, `Only @${c.env.ALLOWED_EMAIL_DOMAIN} accounts are allowed`);
  const row = await upsertUser(c.env.DB, email, body.name ?? email.split("@")[0], null);
  await createSession(c, row.id);
  return c.json({ user: toUser(row, await resolveAdmin(c.env.DB, c.env, row.email)) });
});

auth.post("/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});
