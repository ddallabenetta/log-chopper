"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ChatHeader from "./components/ChatHeader";
import ChatSettings, { type CompressionConfig } from "./components/ChatSettings";
import ChatMessages from "./components/ChatMessages";
import type { LogLine, FilterConfig } from "./LogTypes";

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

export default function ChatSidebar({ lines, pinnedIds, className, open: openProp, onOpenChange }: Props) {
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

  const listRef = React.useRef<HTMLDivElement | null>(null);

  // Toggle impostazioni (persistenza)
  const LS_SETTINGS_OPEN = "logviewer.chat.settings.open";
  const [showSettings, setShowSettings] = React.useState(false);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_SETTINGS_OPEN);
      if (raw === "1") setShowSettings(true);
      else setShowSettings(false);
    } catch {}
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(LS_SETTINGS_OPEN, showSettings ? "1" : "0");
    } catch {}
  }, [showSettings]);

  // Compression config
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
  function serializeLine(content: string, meta: { level: string; fileName: string; lineNumber: number }, maxChars: number) {
    const clipped = truncateMiddle(content, maxChars);
    return `[${meta.level}] ${meta.fileName}:${meta.lineNumber} ${clipped}`;
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

  const buildContextText = React.useCallback(() => {
    const pinnedSet = new Set(pinnedIds);
    const cfg = compression;
    const pinned = lines.filter((l) => pinnedSet.has(l.id)).slice(-cfg.maxPinned);
    const nonPinned = lines.filter((l) => !pinnedSet.has(l.id)).slice(-cfg.maxOthers);
    const grouped = groupByKey(nonPinned, (l) => l.level);
    const sampled: typeof lines = [];
    for (const lvl of ["ERROR", "WARN", "INFO", "DEBUG", "TRACE", "OTHER"] as const) {
      const bucket = grouped.get(lvl) || [];
      sampled.push(...sampleArray(bucket, cfg.samplePerLevel));
    }
    const seen = new Set<string>();
    const ordered: typeof lines = [];
    const pushUnique = (arr: typeof lines) => {
      for (const l of arr) if (!seen.has(l.id)) { seen.add(l.id); ordered.push(l); }
    };
    pushUnique(pinned);
    pushUnique(sampled);
    const serialize = (arr: typeof lines) =>
      arr.map((l) => serializeLine(l.content, { level: l.level, fileName: l.fileName, lineNumber: l.lineNumber }, cfg.maxLineChars)).join("\n");
    return {
      pinnedText: serialize(pinned),
      otherText: serialize(ordered.filter((l) => !pinnedSet.has(l.id))),
      totalPinned: pinned.length,
      totalOthers: ordered.length - pinned.length,
    };
  }, [lines, pinnedIds, compression]);

  async function callLLM(params: {
    provider: Provider;
    model: string;
    apiKey?: string;
    messages: Message[];
    ollamaEndpoint?: string;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const { provider, model, apiKey, messages, ollamaEndpoint, abortSignal } = params;
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
        body: JSON.stringify({ model, messages: messages.map((m) => ({ role: m.role, content: m.content })), stream: false }),
        signal: abortSignal,
      });
      if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
      const data = await res.json();
      return data?.message?.content ?? "";
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
    compression: CompressionConfig;
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
      if (typeof parsed.model === "string" && parsed.model.trim()) setModel(parsed.model);
      if (typeof parsed.apiKey === "string") setApiKey(parsed.apiKey);
      if (parsed.ollamaEndpoint) setOllamaEndpoint(parsed.ollamaEndpoint);
      if (parsed.compression) {
        setCompression({
          maxPinned: parsed.compression.maxPinned ?? compression.maxPinned,
          maxOthers: parsed.compression.maxOthers ?? compression.maxOthers,
          maxLineChars: parsed.compression.maxLineChars ?? compression.maxLineChars,
          samplePerLevel: parsed.compression.samplePerLevel ?? compression.samplePerLevel,
          includeStacks: parsed.compression.includeStacks ?? compression.includeStacks,
        });
        setEnableCompression(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const content = await callLLM({ provider, model, apiKey, messages: nextMessages, ollamaEndpoint });
      const finalContent = content || (streamBuffer ? streamBuffer : "");
      if (finalContent) {
        setMessages((prev) => [...prev, { role: "assistant", content: finalContent }]);
        setStreamBuffer("");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("h-full flex flex-col border-l bg-transparent", className)} style={{ width: open ? 460 : 56 }}>
      <div className="p-2 h-full">
        <Card className="h-full flex flex-col overflow-hidden">
          <ChatHeader
            open={open}
            showSettings={showSettings}
            onToggleOpen={() => setOpen(!open)}
            onToggleSettings={() => setShowSettings((v) => !v)}
          />

          {open && (
            <>
              {showSettings && (
                <ChatSettings
                  provider={provider}
                  setProvider={setProvider}
                  model={model}
                  setModel={setModel}
                  apiKey={apiKey}
                  setApiKey={setApiKey}
                  ollamaEndpoint={ollamaEndpoint}
                  setOllamaEndpoint={setOllamaEndpoint}
                  enableCompression={enableCompression}
                  setEnableCompression={setEnableCompression}
                  compression={compression}
                  setCompression={setCompression}
                  providerModels={PROVIDER_MODELS as any}
                />
              )}

              <ChatMessages
                messages={messages}
                loading={loading}
                streamBuffer={streamBuffer}
                input={input}
                setInput={setInput}
                onSend={() => void send()}
                onStop={() => setLoading(false)}
                listRef={listRef}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}