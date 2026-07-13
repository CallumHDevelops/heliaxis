/** Resend API key — supports Heliaxis_Resend_API_Key or RESEND_API_KEY. */
export function getResendApiKey(): string | undefined {
  const key =
    process.env.Heliaxis_Resend_API_Key ||
    process.env.RESEND_API_KEY ||
    process.env.HELIAXIS_RESEND_API_KEY;
  const trimmed = key?.trim();
  return trimmed || undefined;
}
