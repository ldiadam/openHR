/**
 * Collision-resistant id for audit rows and similar records.
 *
 * Several tables use `TEXT PRIMARY KEY` and call sites previously built ids with
 * `aud-${Date.now()}`. Two writes in the same millisecond collide and the insert
 * fails with a primary-key violation (observed as an intermittent 500 on the
 * company-logo endpoints, which write two audit rows back to back).
 */
export function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
}
