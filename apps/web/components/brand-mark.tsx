import type { SVGProps } from "react";

export function BrandMark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <rect width="64" height="64" rx="16" fill="#d9ff2f" />
      <rect x="12" y="32" width="9" height="23" rx="4.5" fill="#171812" />
      <rect x="25" y="20" width="9" height="35" rx="4.5" fill="#171812" />
      <rect x="38" y="25" width="9" height="30" rx="4.5" fill="#171812" />
      <rect x="51" y="12" width="9" height="34" rx="4.5" fill="#171812" />
      <path d="M16.5 42.5C23 42.5 24.5 35 30 35C35 35 36.5 31 42.5 27.5" fill="none" stroke="#d9ff2f" strokeWidth="5" strokeLinecap="round" />
      <circle cx="30.5" cy="35" r="4.5" fill="#d9ff2f" />
    </svg>
  );
}
