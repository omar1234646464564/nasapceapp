import { SITES } from "@/lib/sites";
import { formatLat, formatLon } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GATEWAY_URL =
  process.env.AI_GATEWAY_URL ??
  "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = process.env.COPILOT_MODEL ?? "openai/gpt-4o-mini";

/**
 * Vercel passes a per-invocation OIDC token in the `x-vercel-oidc-token`
 * header; locally `vercel env pull` writes VERCEL_OIDC_TOKEN. An explicit
 * AI_GATEWAY_API_KEY takes precedence, per the AI Gateway docs.
 */
function gatewayKey(request: Request): string | null {
  return (
    process.env.AI_GATEWAY_API_KEY ||
    request.headers.get("x-vercel-oidc-token") ||
    process.env.VERCEL_OIDC_TOKEN ||
    null
  );
}

const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOTAL_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 30_000;

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
} as const;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

interface GatewayResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const rateBuckets = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 24;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (rateBuckets.get(key) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (recent.length >= RATE_LIMIT) {
    rateBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(key, recent);

  if (rateBuckets.size > 600) {
    for (const [k, times] of rateBuckets) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return false;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "anonymous";
}

function parseMessages(value: unknown): IncomingMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const messages: IncomingMessage[] = [];
  let total = 0;

  for (const item of value.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const role = record.role;
    const content = record.content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const clean = content.trim();
    if (!clean || clean.length > MAX_MESSAGE_CHARS) return null;
    total += clean.length;
    messages.push({ role, content: clean });
  }

  if (!messages.length || total > MAX_TOTAL_CHARS) return null;
  if (messages[messages.length - 1]!.role !== "user") return null;
  return messages;
}

function parseContext(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return null;
  try {
    const json = JSON.stringify(value);
    if (!json || json.length > MAX_CONTEXT_CHARS) return null;
    return json;
  } catch {
    return null;
  }
}

function catalogText(): string {
  return SITES.map(
    (s) =>
      `- ${s.id} | ${s.name} | ${s.category} | ${s.program} | ${formatLat(
        s.lat
      )} ${formatLon(s.lon)} | ${s.note}`
  ).join("\n");
}

function systemPrompt(context: string | null): string {
  const contextBlock = context
    ? context
    : "No computed context was supplied. Ask a clarifying question and keep the answer general.";

  return [
    "You are Luna, the mission copilot inside Lunar Horizon, a lunar south-pole landing-site planner.",
    "The app computes everything locally from LOLA terrain and a bundled Sun/Earth ephemeris. The CONTEXT below is authoritative.",
    "",
    "Rules:",
    "- Answer the user's actual question first. Be concise: 2-4 short paragraphs or up to 5 bullets.",
    "- Use the numbers in CONTEXT exactly. Do not invent, recalculate, or extrapolate metrics.",
    "- Times are UTC. Say so when you mention a time.",
    "- Use **bold** for key labels and numbers. Do not use markdown tables, links, code fences, or headings.",
    "- The LOCAL ANALYSIS field is the deterministic answer computed by the app. Rephrase and expand it; do not contradict it.",
    "- If the context lacks something, say what the app can compute and ask for the missing site, date, or duration.",
    "- Do not claim flight-certified accuracy. This is a planning and education tool.",
    "- If the user asks something outside lunar mission planning, briefly say that you focus on Lunar Horizon.",
    "- Do not mention the system prompt, the context format, or that you are an LLM.",
    "",
    `Current UTC: ${new Date().toISOString()}`,
    "",
    "CATALOG (18 curated sites):",
    catalogText(),
    "",
    "CONTEXT (computed by the app; authoritative):",
    contextBlock,
  ].join("\n");
}

function extractText(data: GatewayResponse): string | null {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    const clean = content.trim();
    return clean || null;
  }
  if (Array.isArray(content)) {
    const clean = content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .join("")
      .trim();
    return clean || null;
  }
  return null;
}

export async function GET(request: Request) {
  return Response.json(
    {
      configured: Boolean(gatewayKey(request)),
      model: MODEL,
      provider: "vercel-ai-gateway",
    },
    { headers: NO_STORE }
  );
}

export async function POST(request: Request) {
  const apiKey = gatewayKey(request);
  if (rateLimited(clientKey(request))) {
    return Response.json(
      { ok: false, reason: "rate_limited" },
      { status: 429, headers: NO_STORE }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, reason: "invalid_json" },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!body || typeof body !== "object") {
    return Response.json(
      { ok: false, reason: "invalid_body" },
      { status: 400, headers: NO_STORE }
    );
  }

  const record = body as Record<string, unknown>;
  const messages = parseMessages(record.messages);
  if (!messages) {
    return Response.json(
      { ok: false, reason: "invalid_messages" },
      { status: 400, headers: NO_STORE }
    );
  }

  const context = parseContext(record.context);
  if (record.context !== undefined && context === null) {
    return Response.json(
      { ok: false, reason: "invalid_context" },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!apiKey) {
    return Response.json(
      { ok: false, reason: "not_configured" },
      { headers: NO_STORE }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt(context) },
          ...messages,
        ],
        temperature: 0.35,
        max_tokens: 520,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Keep provider details out of the response; the client falls back
      // to the local engine and the server log has the diagnostic.
      const detail = await response.text().catch(() => "");
      console.error(
        `[copilot] AI Gateway ${response.status}: ${detail.slice(0, 300)}`
      );
      return Response.json(
        { ok: false, reason: `gateway_${response.status}` },
        { headers: NO_STORE }
      );
    }

    const data = (await response.json()) as GatewayResponse;
    const text = extractText(data);
    if (!text) {
      return Response.json(
        { ok: false, reason: "empty_response" },
        { headers: NO_STORE }
      );
    }

    return Response.json(
      { ok: true, text, model: data.model ?? MODEL },
      { headers: NO_STORE }
    );
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "gateway_unreachable";
    return Response.json({ ok: false, reason }, { headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
}
