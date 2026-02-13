export type SafeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function safeCall<T>(fn: () => Promise<T>): Promise<SafeResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[beneat-risk] Tool error:", msg);
    return { ok: false, error: msg };
  }
}

export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

function toBigintSafeObject(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data, bigintReplacer));
}

export function jsonContent(result: SafeResult<unknown>, hasOutputSchema = false) {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: result.error }, null, 2),
        },
      ],
      isError: true as const,
    };
  }

  const text = JSON.stringify(result.data, bigintReplacer, 2);

  if (hasOutputSchema) {
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: toBigintSafeObject(result.data) as Record<string, unknown>,
    };
  }

  return {
    content: [{ type: "text" as const, text }],
  };
}
