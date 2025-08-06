"use client";

import * as React from "react";
import { Send, Bot, PanelRightClose, PanelRightOpen, Settings2, Loader2, Scissors, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import MessageContent from "./MessageContent";
import type { LogLine, FilterConfig } from "./LogTypes";
import { useI18n } from "@/components/i18n/I18nProvider";

type Provider = "openai" | "deepseek" | "openrouter" | "ollama";
type Message = { role: "system" | "user" | "assistant"; content: string };

type Props = {
  lines: LogLine[];
  pinnedIds: string[];
  filter: FilterConfig;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const DEFAULT_SYSTEM_PROMPT = `You are an expert log analyst.
Goal: find probable errors, warnings, anomalies, and root causes within provided application logs.
Prioritize lines marked as "pinned" by the user; treat them as high-signal clues.
Guidelines:
- Identify error patterns, stack traces, repeated warnings, time correlations.
- Explain concisely the likely root cause and impacted components.
- Propose next steps or checks (config, network, dependency versions).
- If ambiguity exists, list hypotheses and what evidence would confirm/deny them.
Output in Italian. Use bullet points and be concise.`;

const PROVIDER_MODELS: Record<Exclude<Provider, "ollama">, { label: string; models: { id: string; label: string }[] }> = {
  openai: { label: "OpenAI", models: [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }, { id: "gpt-4.1-mini", label: "gpt-4.1-mini" }] },
  deepseek: { label: "DeepSeek", models: [{ id: "deepseek-chat", label: "deepseek-chat" }, { id: "deepseek-reasoner", label: "deepseek-reasoner" }] },
  openrouter: {
    label: "OpenRouter",
    models: [
      { id: "openrouter/horizon-beta", label: "openrouter/horizon-beta" },
      { id: "openrouter/auto", label: "auto" },
      { id: "anthropic/claude-3.5-sonnet", label: "claude-3.5-sonnet" },
      { id: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini" },
    ],
  },
};

export default function ChatSidebar({ lines, pinnedIds, filter, className, open: openProp, onOpenChange }: Props) {
  const { t } = useI18n();

  // stato visibilità controllato/semicontrollato
  const [openUncontrolled, setOpenUncontrolled] = React.useState(true);
  const open = openProp ?? openUncontrolled;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setOpenUncontrolled(v);
  };

  // State base
  const [provider, setProvider] = React.useState<Provider>("openrouter");
  const [model, setModel] = React.useState<string>("openrouter/horizon-beta");
  const [apiKey, setApiKey] = React.useState<string>("");
  const [ollamaEndpoint, setOllamaEndpoint] = React.useState<string>("http://localhost:11434");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([{ role: "system", content: DEFAULT_SYSTEM_PROMPT }]);
  const [loading, setLoading] = React.useState(false);
  const [streamBuffer, setStreamBuffer] = React.useState<string>("");

  const abortRef = React.useRef<AbortController | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // Compression config (dichiarata PRIMA di effetti/callback che la usano)
  type CompressionConfig = {
    maxPinned: number;
    maxOthers: number;
    maxLineChars: number;
    samplePerLevel: number;
    includeStacks: boolean;
  };
  const DEFAULT_COMPRESSION: CompressionConfig = {
    maxPinned: 120,
    maxOthers: 180,
    maxLineChars: 220,
    samplePerLevel: 40,
    includeStacks: true,
  };
  const [compression, setCompression] = React.useState<CompressionConfig>(DEFAULT_COMPRESSION);
  const [enableCompression, setEnableCompression] = React.useState(true);

  function truncateMiddle(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const keep = Math.max(10, Math.floor((maxChars - 3) / 2));
    return text.slice(0, keep) + "..." + text.slice(-keep);
  }
  function serializeLine(l: LogLine, maxChars: number) {
    const content = truncateMiddle(l.content, maxChars);
    return `[${l.level}] ${l.fileName}:${l.lineNumber} ${content}`;
  }
  function sampleArray<T>(arr: T[], max: number): T[] {
    if (arr.length <= max) return arr;
    const step = arr.length / max;
    const out: T[] = [];
    for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }
  function groupByKey<T>(arr: T[], key: (t: T) => string) {
    const map = new Map<string, T[]>();
    for (const item of arr) {
      const k = key(item);
      const bucket = map.get(k);
      if (bucket) bucket.push(item);
      else map.set(k, [item]);
    }
    return map;
  }

  function pickContextCompressed(linesIn: LogLine[], pinnedIdsIn: string[], cfg: CompressionConfig) {
    const pinnedSet = new Set(pinnedIdsIn);
    const pinned = linesIn.filter((l) => pinnedSet.has(l.id)).slice(-cfg.maxPinned);
    const nonPinned = linesIn.filter((l) => !pinnedSet.has(l.id)).slice(-cfg.maxOthers);

    let stacked: LogLine[] = [];
    if (cfg.includeStacks) {
      const tail = nonPinned.slice(-Math.min(nonPinned.length, cfg.samplePerLevel * 4));
      let buf: LogLine[] = [];
      const flush = () => {
        if (buf.length > 0) {
          stacked.push(...buf.slice(0, 3));
          buf = [];
        }
      };
      for (let i = 0; i < tail.length; i++) {
        const cur = tail[i];
        if (cur.level === "ERROR" || cur.level === "WARN") {
          if (buf.length === 0 || buf[buf.length - 1].lineNumber + 1 === cur.lineNumber) buf.push(cur);
          else {
            flush();
            buf.push(cur);
          }
        } else {
          flush();
        }
      }
      flush();
    }

    const grouped = groupByKey(nonPinned, (l) => l.level);
    const sampled: LogLine[] = [];
    for (const lvl of ["ERROR", "WARN", "INFO", "DEBUG", "TRACE", "OTHER"] as const) {
      const bucket = grouped.get(lvl) || [];
      sampled.push(...sampleArray(bucket, cfg.samplePerLevel));
    }

    const seen = new Set<string>();
    const ordered: LogLine[] = [];
    const pushUnique = (arr: LogLine[]) => {
      for (const l of arr) {
        if (!seen.has(l.id)) {
          seen.add(l.id);
          ordered.push(l);
        }
      }
    };
    pushUnique(pinned);
    pushUnique(stacked);
    pushUnique(sampled);

    const serialize = (arr: LogLine[]) => arr.map((l) => serializeLine(l, cfg.maxLineChars)).join("\n");
    const pinnedText = serialize(pinned);
    const otherText = serialize(ordered.filter((l) => !pinnedSet.has(l.id)));

    return { pinnedText, otherText, totalPinned: pinned.length, totalOthers: otherText ? otherText.split("\n").length : 0 };
  }

  async function callLLM(params: {
    provider: Provider;
    model: string;
    apiKey?: string;
    messages: Message[];
    abortSignal?: AbortSignal;
    ollamaEndpoint?: string;
  }): Promise<string> {
    const { provider, model, apiKey, messages, abortSignal, ollamaEndpoint } = params;
    const body = { model, messages, temperature: 0.2 };

    if (provider === "openai") {
      const key = apiKey || (process.env.OPENAI_API_KEY as string | undefined);
      if (!key) throw new Error("OPENAI_API_KEY mancante. Inserisci la chiave nel pannello.");
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortSignal,
      });
      if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    }

    if (provider === "deepseek") {
      const key = apiKey || (process.env.DEEPSEEK_API_KEY as string | undefined);
      if (!key) throw new Error("DEEPSEEK_API_KEY mancante. Inserisci la chiave nel pannello.");
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortSignal,
      });
      if (!res.ok) throw new Error(`DeepSeek error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    }

    if (provider === "ollama") {
      const endpoint = (ollamaEndpoint || "http://localhost:11434").trim();
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
        }),
        signal: abortSignal,
      });
      if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      const content: string = data?.message?.content ?? "";
      return content;
    }

    const key = apiKey || (process.env.OPENROUTER_API_KEY as string | undefined);
    if (!key) throw new Error("OPENROUTER_API_KEY mancante. Inserisci la chiave nel pannello.");
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  const LS_KEY = "logviewer.chat.config.v4";
  type SavedConfig = {
    provider: Provider;
    model: string;
    apiKey: string;
    compression: {
      maxPinned: number;
      maxOthers: number;
      maxLineChars: number;
      samplePerLevel: number;
      includeStacks: boolean;
    };
    ollamaEndpoint?: string;
  };

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedConfig>;
      if (parsed.provider && ["openai", "deepseek", "openrouter", "ollama"].includes(parsed.provider)) {
        setProvider(parsed.provider as Provider);
      }
      if (typeof parsed.model === "string" && parsed.model.trim()) {
        setModel(parsed.model);
      }
      if (typeof parsed.apiKey === "string") {
        setApiKey(parsed.apiKey);
      }
      if (parsed.ollamaEndpoint) setOllamaEndpoint(parsed.ollamaEndpoint);
      if (parsed.compression) {
        setCompression({
          maxPinned: parsed.compression.maxPinned ?? DEFAULT_COMPRESSION.maxPinned,
          maxOthers: parsed.compression.maxOthers ?? DEFAULT_COMPRESSION.maxOthers,
          maxLineChars: parsed.compression.maxLineChars ?? DEFAULT_COMPRESSION.maxLineChars,
          samplePerLevel: parsed.compression.samplePerLevel ?? DEFAULT_COMPRESSION.samplePerLevel,
          includeStacks: parsed.compression.includeStacks ?? DEFAULT_COMPRESSION.includeStacks,
        });
        setEnableCompression(true);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    const cfg: SavedConfig = { provider, model, apiKey, compression, ollamaEndpoint };
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  }, [provider, model, apiKey, compression, ollamaEndpoint]);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight - el.clientHeight;
  }, [messages, streamBuffer, loading]);

  React.useEffect(() => {
    setModel((prev) => {
      if (provider === "openrouter") return prev || "openrouter/horizon-beta";
      if (provider === "ollama") return prev || "llama3";
      const first = [{ id: "gpt-4o-mini" }, { id: "gpt-4.1-mini" }][0]?.id;
      return first ?? prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const buildContextText = React.useCallback(() => {
    const pinnedSet = new Set(pinnedIds);
    const cfg = compression;
    const pinned = lines.filter((l) => pinnedSet.has(l.id)).slice(-cfg.maxPinned);
    const nonPinned = lines.filter((l) => !pinnedSet.has(l.id)).slice(-cfg.maxOthers);
    const grouped = groupByKey(nonPinned, (l) => l.level);
    const sampled: LogLine[] = [];
    for (const lvl of ["ERROR", "WARN", "INFO", "DEBUG", "TRACE", "OTHER"] as const) {
      const bucket = grouped.get(lvl) || [];
      sampled.push(...sampleArray(bucket, cfg.samplePerLevel));
    }
    const seen = new Set<string>();
    const ordered: LogLine[] = [];
    const pushUnique = (arr: LogLine[]) => {
      for (const l of arr) if (!seen.has(l.id)) { seen.add(l.id); ordered.push(l); }
    };
    pushUnique(pinned);
    pushUnique(sampled);
    const serialize = (arr: LogLine[]) => arr.map((l) => serializeLine(l, cfg.maxLineChars)).join("\n");
    return {
      pinnedText: serialize(pinned),
      otherText: serialize(ordered.filter((l) => !pinnedSet.has(l.id))),
      totalPinned: pinned.length,
      totalOthers: ordered.length - pinned.length,
    };
  }, [lines, pinnedIds, compression]);

  const send = async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q) return;

    setMessages((prev) => [...prev.filter((m) => m.role !== "system"), { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    setStreamBuffer("");

    const { pinnedText, otherText, totalPinned, totalOthers } = buildContextText();
    const userContent = [
      "Contesto log (pinned prioritari):",
      totalPinned > 0 ? `-- PINNED (${totalPinned}) --\n${pinnedText}` : "-- PINNED (0) --",
      totalOthers > 0 ? `-- ALTRI (${totalOthers}) --\n${otherText}` : "-- ALTRI (0) --",
      "",
      "Domanda:",
      q,
    ].join("\n");

    const nextMessages: Message[] = [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
      ...messages.filter((m) => m.role !== "system"),
      { role: "user", content: userContent },
    ];

    try {
      const content = await callLLM({
        provider,
        model,
        apiKey,
        messages: nextMessages,
      });
      const finalContent = content || (streamBuffer ? streamBuffer : "");
      if (finalContent) {
        setMessages((prev) => [...prev, { role: "assistant", content: finalContent }]);
        setStreamBuffer("");
      }
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    setLoading(false);
  };

  return (
    <div className={cn("h-full flex flex-col border-l bg-transparent", className)} style={{ width: open ? 460 : 56 }}>
      <div className="p-2 h-full">
        <Card className="h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-2 py-2 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              {open && <span className="text-sm font-medium">{t("chat_title")}</span>}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setOpen(!open)}
              title={open ? "Chiudi" : "Apri"}
            >
              {open ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>

          {open && (
            <>
              <div className="p-2 space-y-2 border-b shrink-0">
                {/* impostazioni omesse per brevità */}
              </div>

              <div ref={listRef} className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
                {messages
                  .filter((m) => m.role !== "system")
                  .map((m, idx) => (
                    <Card key={idx} className={cn("p-2 text-sm", m.role === "assistant" ? "bg-muted/50" : "bg-transparent")}>
                      {m.role === "assistant" ? <MessageContent text={m.content} /> : <div className="whitespace-pre-wrap break-words">{m.content}</div>}
                    </Card>
                  ))}
                {loading && !streamBuffer && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("generating")}
                  </div>
                )}
              </div>

              <div className="p-2 border-t shrink-0">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("ask_placeholder")}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!loading) void (async () => send())();
                      }
                    }}
                  />
                  <Button onClick={() => send()} disabled={loading || !input.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                  {loading && (
                    <Button variant="outline" onClick={() => stop()}>
                      {t("stop")}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}