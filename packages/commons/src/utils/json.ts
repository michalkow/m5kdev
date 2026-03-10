export function safeParseJson<T>(json: string, fallback: T): T;
export function safeParseJson<T>(json: string): T | undefined;
export function safeParseJson<T>(json: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
