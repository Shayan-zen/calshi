import { useState } from "react";
import clsx from "clsx";
import { hashString, initials } from "../lib/format";

const TINTS = [
  ["#e6f6ef", "#0a7a52"],
  ["#e8effd", "#2457b8"],
  ["#fdf1e4", "#a55208"],
  ["#f5ebfb", "#7f2aa8"],
  ["#fde9ef", "#b0284f"],
  ["#eaf4f7", "#1f6b80"],
];

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
  const [bg, fg] = TINTS[hashString(name) % TINTS.length];
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
