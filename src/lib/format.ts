export function formatRupiah(value: number) {
  return `Rp ${Math.max(0, value).toLocaleString("id-ID")}`;
}

export function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
