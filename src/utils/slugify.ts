const TURKISH_MAP: Record<string, string> = {
  'ç': 'c', 'Ç': 'C',
  'ğ': 'g', 'Ğ': 'G',
  'ı': 'i', 'İ': 'I',
  'ö': 'o', 'Ö': 'O',
  'ş': 's', 'Ş': 'S',
  'ü': 'u', 'Ü': 'U',
};

export function slugify(text: string): string {
  let slug = text;

  for (const [from, to] of Object.entries(TURKISH_MAP)) {
    slug = slug.replaceAll(from, to);
  }

  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Converts a term name to a safe filename, preserving original casing and spaces.
 * Only removes characters that are illegal on Windows/Mac/Linux filesystems.
 */
export function safeFilename(term: string): string {
  return term
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\.+$/, '')
    .trim();
}
