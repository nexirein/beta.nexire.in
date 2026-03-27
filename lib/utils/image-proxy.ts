/**
 * lib/utils/image-proxy.ts
 *
 * Utility to route candidate profile pictures through a backend proxy
 * to prevent direct S3 URL exposure in the browser's network tab.
 */

export function getProxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // We only proxy Crustdata S3 URLs for candidate privacy.
  // Other sources (like img.logo.dev) can remain direct for performance.
  if (url.includes('crustdata-media.s3.us-east-2.amazonaws.com')) {
    return `/api/proxy/image?url=${encodeURIComponent(url)}`;
  }

  // Return original URL for non-S3 sources
  return url;
}
