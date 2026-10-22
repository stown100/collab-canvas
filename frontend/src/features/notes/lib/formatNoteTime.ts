const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "just now", "5 minutes ago", "yesterday" — and a plain date after a week.
export function formatNoteTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  if (abs < MINUTE) return 'just now';
  if (abs < HOUR) return relative.format(Math.round(seconds / MINUTE), 'minute');
  if (abs < DAY) return relative.format(Math.round(seconds / HOUR), 'hour');
  if (abs < 7 * DAY) return relative.format(Math.round(seconds / DAY), 'day');
  return dateFormat.format(new Date(iso));
}
