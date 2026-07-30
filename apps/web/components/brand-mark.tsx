import type { SVGProps } from "react";

/**
 * The mark: a rising series with a line traced through it, on the brand
 * gradient. The gradient id is derived from the title so two marks on one page
 * cannot collide, which is why it is not a constant.
 */
export function BrandMark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  const id = `brand-${(title ?? "mark").replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <svg viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={id} x1="0" y1="64" x2="64" y2="0">
          <stop offset="0%" stopColor="#4b45d1" />
          <stop offset="52%" stopColor="#635bff" />
          <stop offset="100%" stopColor="#9b6dff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <rect x="12" y="32" width="9" height="23" rx="4.5" fill="#ffffff" opacity=".55" />
      <rect x="25" y="20" width="9" height="35" rx="4.5" fill="#ffffff" opacity=".75" />
      <rect x="38" y="25" width="9" height="30" rx="4.5" fill="#ffffff" opacity=".62" />
      <rect x="51" y="12" width="9" height="34" rx="4.5" fill="#ffffff" opacity=".9" />
      <path d="M16.5 42.5C23 42.5 24.5 35 30 35C35 35 36.5 31 42.5 27.5" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="30.5" cy="35" r="4.5" fill="#ffffff" />
    </svg>
  );
}
