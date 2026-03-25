/**
 * Sanitizes a job title by removing common prefixes and suffixes.
 * e.g. "Sr. Software Engineer" -> "Software Engineer"
 * e.g. "Secondary, Operations Manager" -> "Operations Manager"
 */
export function sanitizeTitle(title: string | null | undefined): string {
  if (!title) return "";

  let s = title.trim();

  // Remove "Secondary, " prefix
  if (s.toLowerCase().startsWith("secondary,")) {
    s = s.slice(10).trim();
  }

  // Remove "Sr.", "Senior", "Jr.", etc (case insensitive)
  const prefixes = [/^\s*sr\.?\s+/i, /^\s*senior\s+/i, /^\s*jr\.?\s+/i, /^\s*junior\s+/i, /^\s*associate\s+/i];
  for (const p of prefixes) {
    s = s.replace(p, "").trim();
  }

  // Capitalize first letter if needed
  if (s.length > 0) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }

  return s;
}
