export function formatMoney(amount: number, currency = "EUR", locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function formatMoneyRange(min: number, max: number, currency = "EUR", locale = "fr-FR"): string {
  if (min === max) return formatMoney(min, currency, locale);
  return `${formatMoney(min, currency, locale)} – ${formatMoney(max, currency, locale)}`;
}
