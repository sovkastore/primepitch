// Groq chat completions with strict JSON output and free-tier key rotation.
//
// GROQ_API_KEYS holds one or more keys, comma-separated. Every key on the
// free tier has its own daily allowance, so when one key is exhausted (429)
// or rejected (401/403) the next one takes over, and the key that worked is
// remembered in D1 so later calls start from it instead of re-hitting the
// dead one every minute. Same idea as the RapidAPI key rotation.
import { getD1 } from "./d1";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const KEY_INDEX_SETTING = "groq_key_index";

export interface GroqJsonResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface GroqJsonRequest {
  schemaName: string; // short identifier for the JSON schema (letters, digits, _ -)
  schema: Record<string, unknown>; // JSON schema the answer must satisfy
  prompt: string;
  maxTokens?: number;
}

function getKeys(): string[] {
  return (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function getModel(): string {
  return (process.env.GROQ_MODEL || "").trim() || DEFAULT_MODEL;
}

async function getStartIndex(keyCount: number): Promise<number> {
  try {
    const d1 = await getD1();
    if (d1) {
      const row = await d1
        .prepare("SELECT value FROM d1_site_settings WHERE key = ?")
        .bind(KEY_INDEX_SETTING)
        .first<{ value: string }>();
      const i = Number(row?.value ?? 0);
      if (Number.isInteger(i) && i >= 0 && i < keyCount) return i;
    }
  } catch {
    /* default to the first key */
  }
  return 0;
}

async function saveStartIndex(index: number) {
  try {
    const d1 = await getD1();
    if (d1) {
      await d1
        .prepare(
          "INSERT INTO d1_site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        )
        .bind(KEY_INDEX_SETTING, String(index))
        .run();
    }
  } catch {
    /* remembering the key is best-effort */
  }
}

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string; type?: string };
};

// Status codes that mean "this key is no good right now, try the next one".
// Anything else (bad request, model error) is reported straight away — a
// different key won't fix it and would just burn another key's quota.
function keyExhausted(status: number): boolean {
  return status === 429 || status === 401 || status === 403 || status === 402;
}

async function callGroq(
  key: string,
  model: string,
  req: GroqJsonRequest,
  format: "json_schema" | "json_object"
): Promise<{ status: number; body: ChatResponse | null; raw: string }> {
  const prompt =
    format === "json_object"
      ? // JSON mode has no schema enforcement, so spell the shape out.
        `${req.prompt}\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n${JSON.stringify(req.schema)}`
      : req.prompt;
  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_completion_tokens: req.maxTokens ?? 2000,
    messages: [{ role: "user", content: prompt }],
    response_format:
      format === "json_schema"
        ? { type: "json_schema", json_schema: { name: req.schemaName, schema: req.schema, strict: true } }
        : { type: "json_object" },
  };
  // gpt-oss models accept a reasoning dial; other models reject the field.
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: ChatResponse | null = null;
  try {
    parsed = JSON.parse(raw) as ChatResponse;
  } catch {
    /* non-JSON error page */
  }
  return { status: res.status, body: parsed, raw };
}

function describe(status: number, body: ChatResponse | null, raw: string): string {
  const msg = body?.error?.message || raw.slice(0, 160).replace(/\s+/g, " ");
  return `Groq ${status}: ${msg}`;
}

// Ask the model for a JSON answer. Tries every configured key before giving
// up; throws on failure so callers can fall back to their rule-based path.
export async function groqJson<T>(req: GroqJsonRequest): Promise<GroqJsonResult<T>> {
  const keys = getKeys();
  if (keys.length === 0) throw new Error("GROQ_API_KEYS not configured");
  const model = getModel();
  const start = await getStartIndex(keys.length);

  let lastError = "no keys tried";
  for (let n = 0; n < keys.length; n++) {
    const idx = (start + n) % keys.length;
    const key = keys[idx];

    let attempt = await callGroq(key, model, req, "json_schema");
    // Older/smaller models don't support json_schema — fall back to JSON mode
    // on the same key rather than treating it as a dead key.
    if (attempt.status === 400 && /json_schema|response_format|structured/i.test(attempt.raw)) {
      attempt = await callGroq(key, model, req, "json_object");
    }

    if (attempt.status >= 200 && attempt.status < 300 && attempt.body) {
      const content = attempt.body.choices?.[0]?.message?.content;
      if (!content) throw new Error("Groq returned no content");
      let data: T;
      try {
        data = JSON.parse(content) as T;
      } catch {
        throw new Error(`Groq returned invalid JSON: ${content.slice(0, 120)}`);
      }
      if (idx !== start) await saveStartIndex(idx);
      return {
        data,
        inputTokens: attempt.body.usage?.prompt_tokens ?? 0,
        outputTokens: attempt.body.usage?.completion_tokens ?? 0,
        model,
      };
    }

    lastError = describe(attempt.status, attempt.body, attempt.raw);
    if (!keyExhausted(attempt.status) && attempt.status < 500) {
      throw new Error(lastError);
    }
    // 429/401/403/402 or a 5xx: move on to the next key.
  }
  throw new Error(`All ${keys.length} Groq key${keys.length === 1 ? "" : "s"} failed — last: ${lastError}`);
}
