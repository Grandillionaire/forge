export function bytes(n: number | undefined | null): string {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function duration(s: number | undefined | null): string {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function pct(saved: number): string {
  return `${saved >= 0 ? '−' : '+'}${Math.abs(saved).toFixed(0)}%`;
}
