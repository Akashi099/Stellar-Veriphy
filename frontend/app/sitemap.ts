import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://stellarveriphy.com";

type SitemapRoute = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
};

const routes: SitemapRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/verify", changeFrequency: "weekly", priority: 0.9 },
  { path: "/manifest", changeFrequency: "weekly", priority: 0.85 },
  { path: "/builder", changeFrequency: "weekly", priority: 0.8 },
  { path: "/batch-verification", changeFrequency: "weekly", priority: 0.8 },
  { path: "/comparison", changeFrequency: "weekly", priority: 0.75 },
  { path: "/tools", changeFrequency: "weekly", priority: 0.75 },
  { path: "/tools/hash-calculator", changeFrequency: "monthly", priority: 0.7 },
  { path: "/tools/manifest-editor", changeFrequency: "monthly", priority: 0.7 },
  { path: "/tools/signature-verifier", changeFrequency: "monthly", priority: 0.7 },
  { path: "/tools/api-keys", changeFrequency: "monthly", priority: 0.55 },
  { path: "/tools/audit-logs", changeFrequency: "monthly", priority: 0.55 },
  { path: "/tools/compliance-audit", changeFrequency: "monthly", priority: 0.55 },
  { path: "/registry/trust", changeFrequency: "daily", priority: 0.7 },
  { path: "/transactions", changeFrequency: "weekly", priority: 0.65 },
  { path: "/docs", changeFrequency: "monthly", priority: 0.65 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/report-issue", changeFrequency: "yearly", priority: 0.35 },
  { path: "/creator/upload-content", changeFrequency: "monthly", priority: 0.65 },
  { path: "/creator/upload-content/media-input", changeFrequency: "monthly", priority: 0.5 },
  { path: "/creator/upload-content/manifest-step", changeFrequency: "monthly", priority: 0.5 },
  { path: "/creator/upload-content/review", changeFrequency: "monthly", priority: 0.5 },
  { path: "/features-showcase", changeFrequency: "monthly", priority: 0.45 },
  { path: "/timeline-view", changeFrequency: "monthly", priority: 0.45 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL.replace(/\/$/, "");
  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
