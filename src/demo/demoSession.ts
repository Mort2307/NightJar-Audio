// Fictional testing data stays in this browser tab and is never sent to Nightjar APIs.
const prefix = 'nightjar.demo.v1:';
const memory = new Map<string, unknown>();

export function readDemo<T>(key: string, seed: T): T {
  if (memory.has(key)) return structuredClone(memory.get(key) as T);
  try {
    const stored = window.sessionStorage.getItem(prefix + key);
    if (stored !== null) {
      const value = JSON.parse(stored) as T;
      memory.set(key, value);
      return structuredClone(value);
    }
  } catch { /* Private browsing can disable session storage. */ }
  const initial = structuredClone(seed);
  memory.set(key, initial);
  return structuredClone(initial);
}

export function writeDemo<T>(key: string, value: T): void {
  const snapshot = structuredClone(value);
  memory.set(key, snapshot);
  try { window.sessionStorage.setItem(prefix + key, JSON.stringify(snapshot)); }
  catch { /* In-memory simulation still works if storage is unavailable. */ }
}

export function resetDemo(): void {
  memory.clear();
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index--) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix)) window.sessionStorage.removeItem(key);
    }
  } catch { /* In-memory state has already been cleared. */ }
}
