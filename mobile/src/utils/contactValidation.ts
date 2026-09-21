export function normalizePhone(value: string): string {
  const trimmed = value.trim().replace(/[\s()-]/g, '');
  const normalized = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error('Enter a valid phone number with country code.');
  return normalized;
}
