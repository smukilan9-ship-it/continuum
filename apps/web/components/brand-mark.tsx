import type { SVGProps } from "react";

/**
 * The mark: a rising series with a line traced through it.
 *
 * Jade for the field, amber for the traced line — the same two roles they carry
 * everywhere else in the product, and the same figure as the landing page's
 * thread: a line running through separate things and ending somewhere. It was a
 * purple gradient left over from an abandoned palette, which matched nothing on
 * any screen it appeared on.
 *
 * The gradient id is derived from the title so two marks on one page cannot
 * collide, which is why it is not a constant.
 */
export function BrandMark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  const id = `brand-${(title ?? "mark").replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <svg viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={id} x1="0" y1="64" x2="64" y2="0">
          <stop offset="0%" stopColor="#046b57" />
          <stop offset="52%" stopColor="#05a37c" />
          <stop offset="100%" stopColor="#0abc90" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <rect x="12" y="32" width="9" height="23" rx="4.5" fill="#ffffff" opacity=".55" />
      <rect x="25" y="20" width="9" height="35" rx="4.5" fill="#ffffff" opacity=".75" />
      <rect x="38" y="25" width="9" height="30" rx="4.5" fill="#ffffff" opacity=".62" />
      <rect x="51" y="12" width="9" height="34" rx="4.5" fill="#ffffff" opacity=".9" />
      {/* The traced line is amber: the one thing on the mark that is not the
          field, exactly as amber is used everywhere else. */}
      <path d="M16.5 42.5C23 42.5 24.5 35 30 35C35 35 36.5 31 42.5 27.5" fill="none" stroke="#ffb020" strokeWidth="5" strokeLinecap="round" />
      <circle cx="30.5" cy="35" r="4.5" fill="#ffb020" />
    </svg>
  );
}
