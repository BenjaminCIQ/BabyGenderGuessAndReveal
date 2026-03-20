/** Format milliseconds as "2d 5h 3m 10s" (compact). */
export function formatCountdownMs(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`, `${sec}s`);
  return parts.join(' ');
}

/** ISO string → value for input[type="datetime-local"] in local TZ. */
export function isoToDatetimeLocal(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** datetime-local value → ISO UTC for API. */
export function datetimeLocalToIso(local) {
  if (!local || typeof local !== 'string') return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
