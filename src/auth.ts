/**
 * Constant-time comparison via SHA-256 + crypto.subtle.timingSafeEqual.
 *
 * Hashes both inputs to a fixed 32-byte digest so neither the length
 * nor any prefix of `expected` can be inferred from response timing.
 * Cloudflare guidance: developers.cloudflare.com/workers/best-practices/workers-best-practices/
 */
export async function verifyToken(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}
