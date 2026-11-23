import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Trash2 } from "lucide-react";
import { api } from "../api";
import { qk, useComments, useUser } from "../hooks/queries";
import Avatar from "./Avatar";
import { useToast } from "./Toast";
import { EmptyState, ErrorState, Skeleton, Spinner } from "./ui";
import { relTime } from "../lib/format";

export default function Comments({ slug }: { slug: string }) {
  const { user } = useUser();
  const location = useLocation();
  const comments = useComments(slug);
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.comments(slug) });
    void qc.invalidateQueries({ queryKey: ["event", slug] });
  };

  const post = useMutation({
    mutationFn: () => api.postComment(slug, body.trim()),
    onSuccess: () => {
      setBody("");
      refresh();
    },
    onError: (e) => toast.error("Couldn't post comment", e instanceof Error ? e.message : String(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteComment(id),
    onSuccess: () => {
      setConfirming(null);
      refresh();
    },
    onError: (e) => toast.error("Couldn't delete comment", e instanceof Error ? e.message : String(e)),
  });

  const list = comments.data?.comments ?? [];
  const tooLong = body.length > 2000;

  return (
    <div>
      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim() && !tooLong) post.mutate();
          }}
          className="flex gap-3"
        >
          <Avatar name={user.name} url={user.avatarUrl} size={34} />
          <div className="flex-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Share your take"
              className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm placeholder:text-faint focus:border-ink-2/40 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className={tooLong ? "text-xs text-down" : "text-xs text-faint"}>
                {body.length > 1500 ? `${body.length}/2000` : ""}
              </span>
              <button
                type="submit"
                disabled={!body.trim() || tooLong || post.isPending}
                className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white hover:bg-ink-2 disabled:opacity-40"
              >
                {post.isPending && <Spinner className="text-white" />}
                Post
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="rounded-lg bg-surface px-4 py-3 text-sm text-muted">
          <Link to={`/login?redirect=${encodeURIComponent(location.pathname)}`} className="font-semibold text-ink hover:underline">
            Log in
          </Link>{" "}
          to join the discussion.
        </div>
      )}

      <div className="mt-5">
        {comments.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.isError ? (
          <ErrorState error={comments.error} onRetry={() => comments.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={<MessageCircle className="size-5" />} title="No comments yet" body="Start the conversation." className="py-8" />
        ) : (
          <ul className="divide-y divide-line-2">
            {list.map((c) => (
              <li key={c.id} className="flex gap-3 py-3.5">
                <Avatar name={c.userName} url={c.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{c.userName}</span>
                    <span className="text-xs text-faint">{relTime(c.createdAt)}</span>
                    {c.canDelete && (
                      <span className="ml-auto flex items-center gap-1">
                        {confirming === c.id ? (
                          <>
                            <span className="text-xs text-muted">Delete?</span>
                            <button
                              onClick={() => del.mutate(c.id)}
                              disabled={del.isPending}
                              className="rounded px-1.5 py-0.5 text-xs font-semibold text-down hover:bg-down-tint"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-muted hover:bg-surface"
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirming(c.id)}
                            aria-label="Delete comment"
                            className="rounded p-1 text-faint hover:bg-surface hover:text-down"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
