import { useState } from "react";
import clsx from "clsx";
import { hashString, initials } from "../lib/format";

/** Hues for generated avatars; lightness/saturation come from theme vars so they adapt to dark mode. */
const HUES = [155, 220, 30, 280, 340, 195];

export default function Avatar({
  name,
  url,
  size = 28,
  className,
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const h = HUES[hashString(name) % HUES.length];
  const bg = `hsl(${h} var(--avatar-bg-s) var(--avatar-bg-l))`;
  const fg = `hsl(${h} 62% var(--avatar-fg-l))`;
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={style}
        className={clsx("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: bg, color: fg }}
      className={clsx("inline-grid shrink-0 place-items-center rounded-full font-semibold", className)}
    >
      {initials(name)}
    </span>
  );
}
