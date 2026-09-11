export const PUBLIC_DISCOUNT_PERCENT = 20;
export const PUBLIC_DISCOUNT_LABEL = `${PUBLIC_DISCOUNT_PERCENT}%`;

export function normalizePublicDiscountClaim(text: string) {
  return text
    .replace(/(?:de\s+)?(?:15|20|25|30)\s*%\s+a\s+(?:15|20|25|30)\s*%/gi, PUBLIC_DISCOUNT_LABEL)
    .replace(/(?:até\s+)?(?:15|25|30)\s*%/gi, PUBLIC_DISCOUNT_LABEL);
}
