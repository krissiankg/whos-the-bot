// The gateway protocol always returns a JSON object, never a primitive or array.
export async function readJsonObject<T extends object>(response: Response): Promise<T> {
  const data: unknown = await response.json();
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid gateway response");
  }
  return data as T;
}
