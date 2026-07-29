import { notFound } from "next/navigation";

import { KitGallery } from "./kit-gallery";

/**
 * The visual-regression fixture (§17 Phase 1, §18.7): every component in every
 * state, in both themes. Excluded from the sitemap and 404s outside development
 * so it never ships as a public surface.
 */
export const metadata = { title: "Component kit", robots: { index: false, follow: false } };

export default function DevKitPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_KIT !== "true") notFound();
  return <KitGallery />;
}
