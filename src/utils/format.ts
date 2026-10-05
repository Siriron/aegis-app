export function shortAddr(addr: string, chars = 6): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
}

export function formatTs(ts: number): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts * 1000));
}

export function formatCountdown(until: number, now: number): string {
  const diff = until - now;
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
