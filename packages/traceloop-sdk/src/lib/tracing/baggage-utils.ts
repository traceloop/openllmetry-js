export function parseKeyPairsIntoRecord(
  keyPairs: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!keyPairs) return result;

  keyPairs.split(",").forEach((pair) => {
    const [key, value] = pair.split("=");
    if (key && value) {
      result[key.trim()] = value.trim();
    }
  });
  return result;
}
