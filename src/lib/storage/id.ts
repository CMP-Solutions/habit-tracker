/** Generates a unique id for a new local record. */
export function generateId(): string {
  return crypto.randomUUID();
}
