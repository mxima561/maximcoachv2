import Redis from "ioredis";

let client: Redis | null = null;

export function getValkey(): Redis {
  if (!client) {
    client = new Redis(process.env.VALKEY_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return client;
}
