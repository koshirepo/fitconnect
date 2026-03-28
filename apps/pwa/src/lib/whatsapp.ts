export function normalizeWhatsAppPhone(phone?: string | null): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }

  return digits;
}

export function buildWhatsAppUrl(phone?: string | null, text?: string): string | null {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return null;

  if (!text?.trim()) {
    return `https://wa.me/${normalizedPhone}`;
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`;
}
