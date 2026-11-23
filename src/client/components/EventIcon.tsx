import clsx from "clsx";
import { slugGradient } from "../lib/format";

const CATEGORY_EMOJI: Record<string, string> = {
  Campus: "🎓",
  Politics: "🏛️",
  Sports: "🏏",
  Economics: "📈",
  Crypto: "🪙",
  Tech: "💻",
  Culture: "🎬",
  Climate: "🌦️",
};

export default function EventIcon({
  slug,
  icon,
  imageUrl,
  category,
  size = 44,
  className,
}: {
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  category?: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        style={style}
        className={clsx("shrink-0 rounded-lg border border-line object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: slugGradient(slug), fontSize: Math.round(size * 0.5) }}
      className={clsx("inline-grid shrink-0 place-items-center rounded-lg leading-none ring-1 ring-inset ring-black/5 dark:ring-white/5", className)}
    >
      {icon || (category && CATEGORY_EMOJI[category]) || "📊"}
    </span>
  );
}
