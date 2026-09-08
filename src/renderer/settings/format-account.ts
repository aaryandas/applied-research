const MICRO_USD_PER_DOLLAR = 1_000_000;
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatMicrousd(value: number): string {
  // Split the integer first: a floating-point dollar value can lose a microUSD.
  const fraction = value % MICRO_USD_PER_DOLLAR;
  const dollars = (value - fraction) / MICRO_USD_PER_DOLLAR;
  const decimal = String(fraction)
    .padStart(6, '0')
    .replace(/0{1,4}$/u, '');
  return `${usd.format(dollars)}.${decimal}`;
}

export function formatQuotaMonth(month: string): string {
  const firstDay = new Date(`${month}-01T00:00:00Z`);
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(firstDay);
  return `${label} (UTC)`;
}

export function accountInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? '')
      .join('')
      .toLocaleUpperCase() || 'A'
  );
}
