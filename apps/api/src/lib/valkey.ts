import Redis from "ioredis";

let client: Redis | null = null;

export function getValkey(): Redis | null {
  if (!process.env.VALKEY_URL) return null;
  if (!client) {
    client = new Redis(process.env.VALKEY_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return client;
}
