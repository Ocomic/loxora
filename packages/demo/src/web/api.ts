export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Request failed");
  return value as T;
}
export const post = <T>(path: string, value: unknown = {}): Promise<T> =>
  api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
