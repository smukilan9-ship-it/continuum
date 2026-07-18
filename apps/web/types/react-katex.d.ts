declare module "react-katex" {
  import type { ComponentType, ReactNode } from "react";
  export const InlineMath: ComponentType<{ math: string; errorColor?: string; renderError?: (error: Error) => ReactNode }>;
  export const BlockMath: ComponentType<{ math: string; errorColor?: string; renderError?: (error: Error) => ReactNode }>;
}
