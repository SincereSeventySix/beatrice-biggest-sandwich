export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${prefix}${path.startsWith("/") ? path : `/${path}`}`;
}
