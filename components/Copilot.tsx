"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Cpu,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  COPILOT_SUGGESTIONS,
  buildCopilotReply,
  parseCustomCoordinates,
  welcomeReply,
  type CopilotAction,
  type CopilotReply,
  type CopilotScenario,
} from "@/lib/copilot";
import {
  loadTerrainGrid,
  resolveSiteHorizon,
  useHorizonBundle,
} from "@/lib/terrain";
import { loadHorizonBundle } from "@/lib/horizons";
import { SITE_BY_ID, makeCustomSite, type Site } from "@/lib/sites";
import { formatDateShort } from "@/lib/format";

const STORAGE_KEY = "lunarhorizon:copilot:v1";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: "local" | "ai";
  actions?: CopilotAction[];
  pending?: boolean;
  refining?: boolean;
}

let messageCounter = 0;
function uid(): string {
  messageCounter += 1;
  return `m${Date.now().toString(36)}-${messageCounter}`;
}

function welcomeMessage(): ChatMessage {
  const welcome = welcomeReply();
  return {
    id: "welcome",
    role: "assistant",
    text: welcome.text,
    actions: welcome.actions,
  };
}

function readScenario(): CopilotScenario | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  let site: Site | null = null;
  let date = new Date();

  const t = params.get("t");
  if (t) {
    const ms = Date.parse(t);
    if (Number.isFinite(ms)) date = new Date(ms);
  }

  const s = params.get("s");
  if (s) {
    const first = s.split(",")[0] ?? "";
    const at = first.lastIndexOf("@");
    if (at > 0) {
      const id = first.slice(0, at);
      const ms = Date.parse(first.slice(at + 1));
      if (SITE_BY_ID.has(id)) site = SITE_BY_ID.get(id)!;
      if (Number.isFinite(ms)) date = new Date(ms);
    }
  }

  if (!site) {
    const sid = params.get("site");
    if (sid === "custom") {
      const lat = Number(params.get("lat"));
      const lon = Number(params.get("lon"));
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        site = makeCustomSite(lat, ((lon % 360) + 360) % 360);
      }
    } else if (sid && SITE_BY_ID.has(sid)) {
      site = SITE_BY_ID.get(sid)!;
    }
  }

  if (!site) return null;
  const r = Number(params.get("range"));
  const rangeDays = [7, 30, 90, 365].includes(r) ? r : 30;
  return { site, date, rangeDays };
}

async function askGateway(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  local: CopilotReply
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 18_000);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, context: local.context }),
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const data = (await response.json()) as {
      ok?: boolean;
      text?: string;
      reason?: string;
    };
    if (data.ok && typeof data.text === "string" && data.text.trim()) {
      return { ok: true, text: data.text.trim() };
    }
    return { ok: false, reason: data.reason ?? "unknown" };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "network";
    return { ok: false, reason };
  }
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded border border-white/10 bg-white/[0.06] px-1 py-px font-mono text-[0.92em] text-[#dbe6f5]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={index} className="text-[#d5dfec]">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function renderRich(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let blockKey = 0;

  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blockKey++}`} className="my-1.5 space-y-1 pl-3.5">
        {items.map((item, index) => (
          <li
            key={index}
            className="list-disc pl-0.5 marker:text-amber/60"
          >
            {renderInline(item)}
          </li>
        ))}
      </ul>
    );
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    if (line.trim()) {
      blocks.push(
        <p key={`p-${blockKey++}`} className="mb-1.5 last:mb-0">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushBullets();
  return <>{blocks}</>;
}

function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-1 py-1"
      aria-label="Luna is thinking"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber/70"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber/25 bg-amber/[0.08]">
          <Sparkles size={11} className="text-amber" />
        </span>
      )}
      <div className={`min-w-0 max-w-[87%] ${isUser ? "items-end" : ""}`}>
        <div
          className={`rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
            isUser
              ? "rounded-br-md border border-amber/25 bg-amber/[0.13] text-amber-hot"
              : "rounded-bl-md border border-white/[0.08] bg-white/[0.035] text-[#c9d5e4]"
          }`}
        >
          {message.pending ? <TypingDots /> : renderRich(message.text)}
        </div>

        {!isUser && (message.source || message.refining) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1 text-[9px] text-dim">
            {message.source === "ai" ? (
              <Sparkles size={9} className="text-earth" />
            ) : (
              <Cpu size={9} />
            )}
            <span>
              {message.source === "ai"
                ? "AI Gateway · numbers from local engine"
                : "Local engine"}
            </span>
            {message.refining && (
              <span className="text-amber/70">· refining with AI…</span>
            )}
          </div>
        )}

        {message.actions?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.actions.map((action) => (
              <Link
                key={`${action.label}-${action.href}`}
                href={action.href}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[9.5px] font-medium text-muted transition hover:border-amber/35 hover:text-amber-hot"
              >
                {action.label}
                <ArrowRight size={9} />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Copilot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    welcomeMessage(),
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiMode, setAiMode] = useState<"unknown" | "on" | "off">("unknown");
  const [aiReason, setAiReason] = useState<string | null>(null);
  const [scenario, setScenario] = useState<CopilotScenario | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const { bundle } = useHorizonBundle(open);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const messagesRef = useRef(messages);
  const sendRef = useRef<(text?: string) => void>(() => {});

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Restore the conversation for this tab.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(
            parsed
              .filter((m) => m && (m.role === "user" || m.role === "assistant"))
              .map((m) => ({ ...m, pending: false, refining: false }))
              .slice(-40)
          );
        }
      }
    } catch {
      // Storage can be unavailable in private browsing; ignore it.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const clean = messages
        .map(({ pending: _pending, refining: _refining, ...rest }) => rest)
        .slice(-40);
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore quota/security errors.
    }
  }, [messages, hydrated]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, busy]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    setScenario(readScenario());
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busyRef.current) return;

      busyRef.current = true;
      setBusy(true);
      setInput("");

      const userMessage: ChatMessage = {
        id: uid(),
        role: "user",
        text,
      };
      setMessages((prev) => [...prev, userMessage]);

      const currentScenario = readScenario();
      setScenario(currentScenario);
      const now = new Date();

      try {
        const horizonBundle = await loadHorizonBundle();
        const custom = parseCustomCoordinates(text);
        const terrain = custom ? await loadTerrainGrid() : null;
        const getProfile = (site: Site) =>
          resolveSiteHorizon(site, horizonBundle, terrain, false, null).profile;

        const local = buildCopilotReply(text, {
          now,
          scenario: currentScenario,
          getProfile,
        });

        const assistantId = uid();
        const localMessage: ChatMessage = {
          id: assistantId,
          role: "assistant",
          text: local.text,
          actions: local.actions,
          source: "local",
          refining: aiMode !== "off",
        };

        setMessages((prev) => [...prev, localMessage]);
        setBusy(false);
        busyRef.current = false;

        if (aiMode === "off") return;

        const history = [...messagesRef.current, userMessage]
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.text }));
        const ai = await askGateway(history, local);

        if (ai.ok) {
          setAiMode("on");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, text: ai.text, source: "ai", refining: false }
                : m
            )
          );
        } else {
          setAiMode("off");
          setAiReason(ai.reason);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, refining: false } : m
            )
          );
        }
      } catch {
        setBusy(false);
        busyRef.current = false;
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: "I couldn't load the terrain bundle for that question. Check your connection and try again, or open the planner directly.",
            actions: [
              { label: "Open planner", href: "/" },
              { label: "Methods & limits", href: "/methods" },
            ],
            source: "local",
          },
        ]);
      }
    },
    [input, aiMode]
  );

  useEffect(() => {
    sendRef.current = (text?: string) => {
      void send(text);
    };
  }, [send]);

  // The planner can open the copilot with a scenario-aware question.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ question?: string }>).detail;
      setOpen(true);
      if (detail?.question) {
        window.setTimeout(() => sendRef.current(detail.question), 80);
      }
    };
    window.addEventListener("lunar:ask", handler);
    return () => window.removeEventListener("lunar:ask", handler);
  }, []);

  const reset = () => {
    setMessages([welcomeMessage()]);
    setAiMode("unknown");
    setAiReason(null);
  };

  const onComposerKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const blocked = aiReason === "gateway_403" || aiReason === "not_configured";

  const status =
    aiMode === "on"
      ? {
          label: "AI Gateway",
          tone: "chip-earth",
          title:
            "Answers are refined by the Vercel AI Gateway; every number comes from the local LOLA + ephemeris engine.",
        }
      : aiMode === "off"
        ? {
            label: "Local engine",
            tone: "chip-mint",
            title: blocked
              ? "The AI Gateway needs AI Gateway credits on the Vercel account, so answers come from the local LOLA + ephemeris engine."
              : "The AI Gateway is unavailable, so answers come from the local LOLA + ephemeris engine.",
          }
        : {
            label: "Local engine",
            tone: "chip-mint",
            title:
              "The deterministic local engine answers first; AI refinement is attempted when the gateway is configured.",
          };

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="luna-panel"
          className="fixed bottom-5 right-5 z-[75] flex items-center gap-2 rounded-full border border-amber/40 bg-gradient-to-b from-[#f8ce6a] to-[#e8ab35] px-3.5 py-3 text-[12.5px] font-semibold text-[#241a06] shadow-[0_16px_40px_-16px_rgba(246,196,83,0.8)] transition hover:brightness-105 active:translate-y-px sm:px-4"
        >
          <Sparkles size={16} />
          Ask Luna
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[80] sm:inset-auto sm:bottom-5 sm:right-5">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm sm:hidden"
            onClick={close}
            aria-hidden="true"
          />
          <div
            id="luna-panel"
            role="dialog"
            aria-modal="false"
            aria-label="Luna mission copilot"
            className="absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#070c14] shadow-[0_30px_90px_-30px_rgba(0,0,0,0.95)] sm:static sm:h-[min(680px,calc(100dvh-2.5rem))] sm:w-[430px] sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-3.5 py-3">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber/30 bg-amber/[0.1]">
                <Sparkles size={16} className="text-amber" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-mint ring-2 ring-[#070c14]" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-ink">Luna</span>
                  <span className="chip chip-amber !px-1.5 !py-0.5 !text-[8.5px]">
                    Mission copilot
                  </span>
                </div>
                <div className="truncate text-[10px] text-dim">
                  LOLA terrain + local ephemeris
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <span className={`chip ${status.tone} !px-1.5 !py-0.5 !text-[8.5px]`} title={status.title}>
                  {status.label}
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg p-1.5 text-dim transition hover:bg-white/[0.06] hover:text-ink"
                  aria-label="Start a new conversation"
                  title="Start a new conversation"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-1.5 text-dim transition hover:bg-white/[0.06] hover:text-ink"
                  aria-label="Close Luna"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {scenario && (
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-3.5 py-1.5 text-[9.5px] text-dim">
                <span className="h-1.5 w-1.5 rounded-full bg-amber/80" />
                <span className="truncate">
                  Context: {scenario.site.shortName} ·{" "}
                  {formatDateShort(scenario.date)} · {scenario.rangeDays}-day
                  timeline
                </span>
              </div>
            )}

            {/* Messages */}
            <div
              ref={listRef}
              className="flex-1 space-y-3 overflow-y-auto px-3.5 py-4"
              aria-live="polite"
            >
              {messages.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))}
              {busy && (
                <div className="flex gap-2">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber/25 bg-amber/[0.08]">
                    <Sparkles size={11} className="text-amber" />
                  </span>
                  <div className="rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.035] px-3 py-2">
                    <TypingDots />
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && !busy && (
              <div className="border-t border-white/[0.06] px-3.5 pt-2.5">
                <div className="label mb-1.5 text-[8.5px]">Try asking</div>
                <div className="flex flex-wrap gap-1.5">
                  {COPILOT_SUGGESTIONS.slice(0, 4).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-left text-[9.5px] leading-snug text-muted transition hover:border-amber/35 hover:text-amber-hot"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Composer */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="border-t border-white/[0.08] p-3"
            >
              <div className="flex items-end gap-2 rounded-xl border border-white/[0.1] bg-black/30 p-1.5 transition focus-within:border-amber/40">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  rows={2}
                  maxLength={1200}
                  placeholder="Ask about a site, date, or mission…"
                  aria-label="Message Luna"
                  className="max-h-28 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[12.5px] leading-relaxed text-ink placeholder:text-dim focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || busy}
                  className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-[#f8ce6a] to-[#e8ab35] text-[#241a06] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                >
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ArrowUp size={15} strokeWidth={2.4} />
                  )}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
                <span className="hidden text-[9px] text-dim sm:block">
                  Enter to send · Shift+Enter for a new line
                </span>
                <span className="text-[9px] text-dim/70">
                  Planning aid, not flight-certified
                </span>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
