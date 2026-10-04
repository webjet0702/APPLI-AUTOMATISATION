const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const euroRounded = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

export function formatEuro(value: number): string {
  return euro.format(value);
}

export function formatEuroRounded(value: number): string {
  return euroRounded.format(value);
}

export function formatNumber(value: number): string {
  return number.format(value);
}

/** +10,7 % / −3,2 % */
export function formatPct(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** AAAA-MM-JJ → JJ/MM/AAAA */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}
