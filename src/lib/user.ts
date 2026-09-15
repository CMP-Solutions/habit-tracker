const NAME_KEY = "ritual:user-name";

/** The name entered on first use, or null if none has been set yet. */
export function getUserName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NAME_KEY);
}

export function setUserName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

/**
 * German possessive form of a name: "Philipp" -> "Philipps", but a name
 * already ending in an s-sound (s/ß/x/z) only gets an apostrophe —
 * "Klaus" -> "Klaus'", not "Klausens".
 */
export function possessive(name: string): string {
  const trimmed = name.trim();
  return /[sxzß]$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}s`;
}
