import { Buffer } from "buffer";

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as Record<string, unknown>).Buffer = Buffer;
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).Buffer = Buffer;
  (window as unknown as Record<string, unknown>).global = window;
}
