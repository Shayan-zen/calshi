import { Hono } from "hono";
import { z } from "zod";
import type { Comment } from "../../shared/types";
import { type AppEnv, type AuthedUser, requireUser } from "../lib/session";
import { HttpError, newId, notFound, parseBody } from "../lib/util";

export const comments = new Hono<AppEnv>();

interface CommentRow {
  id: string;
  event_slug: string;
  user_id: string;
  body: string;
  created_at: number;
  user_name: string;
  avatar_url: string | null;
}

const toComment = (r: CommentRow, viewer: AuthedUser | null): Comment => ({
  id: r.id,
  eventSlug: r.event_slug,
  userId: r.user_id,
  userName: r.user_name,
  avatarUrl: r.avatar_url,
  body: r.body,
  createdAt: r.created_at,
  canDelete: !!viewer && (viewer.isAdmin || viewer.row.id === r.user_id),
});

const SELECT = `SELECT c.*, u.name AS user_name, u.avatar_url FROM comments c JOIN users u ON u.id = c.user_id`;

comments.get("/events/:slug/comments", async (c) => {
  const { results } = await c.env.DB.prepare(`${SELECT} WHERE c.event_slug = ? ORDER BY c.created_at DESC LIMIT 200`)
    .bind(c.req.param("slug"))
    .all<CommentRow>();
  const viewer = c.get("user");
  return c.json({ comments: results.map((r) => toComment(r, viewer)) });
});

comments.post("/events/:slug/comments", async (c) => {
  const u = requireUser(c);
  const slug = c.req.param("slug");
  const { body } = await parseBody(c, z.object({ body: z.string().trim().min(1).max(2000) }));
  const db = c.env.DB;
  const ev = await db.prepare(`SELECT slug FROM events WHERE slug = ?`).bind(slug).first();
  if (!ev) throw notFound("Event not found");
  const last = await db
    .prepare(`SELECT MAX(created_at) AS t FROM comments WHERE user_id = ?`)
    .bind(u.row.id)
    .first<{ t: number | null }>();
  if (last?.t && Date.now() - last.t < 5000) throw new HttpError(429, "You're commenting too fast");
  const id = newId();
  const now = Date.now();
  await db.prepare(`INSERT INTO comments (id, event_slug, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).bind(id, slug, u.row.id, body, now).run();
  const comment = toComment(
    { id, event_slug: slug, user_id: u.row.id, body, created_at: now, user_name: u.row.name, avatar_url: u.row.avatar_url },
    u,
  );
  return c.json({ comment });
});

comments.delete("/comments/:id", async (c) => {
  const u = requireUser(c);
  const row = await c.env.DB.prepare(`SELECT user_id FROM comments WHERE id = ?`).bind(c.req.param("id")).first<{ user_id: string }>();
  if (!row) throw notFound("Comment not found");
  if (!u.isAdmin && row.user_id !== u.row.id) throw new HttpError(403, "Not allowed");
  await c.env.DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
