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

type Provider = "openai" | "deepseek" | "openrouter" | "ollama";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type Props = {
  lines: LogLine[];
  pinnedIds: string[];
  filter: FilterConfig;
  className?: string;
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
  openai: {
    label: "OpenAI",
    models: [
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
    ],
  },
  deepseek: {
    label: "DeepSeek",
    models: [
      { id: "deepseek-chat", label: "deepseek-chat" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner" },
    ],
  },
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

// Simple helpers for token reduction
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
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.floor(i * step)]);
  }
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

type CompressionConfig = {
  maxPinned: number;       // hard cap for pinned lines
  maxOthers: number;       // hard cap for non-pinned lines (pre-compression pool)
  maxLineChars: number;    // truncate line length
  samplePerLevel: number;  // sample count per level for others
  includeStacks: boolean;  // try to keep consecutive ERROR lines together
};

const DEFAULT_COMPRESSION: CompressionConfig = {
  maxPinned: 120,
  maxOthers: 180,
  maxLineChars: 220,
  samplePerLevel: 40,
  includeStacks: true,
};

function pickContextCompressed(lines: LogLine[], pinnedIds: string[], cfg: CompressionConfig) {
  const pinnedSet = new Set(pinnedIds);
  const pinned = lines.filter((l) => pinnedSet.has(l.id)).slice(-cfg.maxPinned);

  // Non pinned pool (recent first)
  const nonPinned = lines.filter((l) => !pinnedSet.has(l.id)).slice(-cfg.maxOthers);

  // Optionally keep small stack chunks: merge consecutive ERROR lines (or WARN) in the recent tail
  let stacked: LogLine[] = [];
  if (cfg.includeStacks) {
    const tail = nonPinned.slice(-Math.min(nonPinned.length, cfg.samplePerLevel * 4));
    let buf: LogLine[] = [];
    const flush = () => {
      if (buf.length > 0) {
        // keep first 3 of a burst
        stacked.push(...buf.slice(0, 3));
        buf = [];
      }
    };
    for (let i = 0; i < tail.length; i++) {
      const cur = tail[i];
      if (cur.level === "ERROR" || cur.level === "WARN") {
        // consecutive bursts
        if (buf.length === 0 || buf[buf.length - 1].lineNumber + 1 === cur.lineNumber) {
          buf.push(cur);
        } else {
          flush();
          buf.push(cur);
        }
      } else {
        flush();
      }
    }
    flush();
  }

  // Group remaining nonPinned by level and sample to keep variety
  const grouped = groupByKey(nonPinned, (l) => l.level);
  const sampled: LogLine[] = [];
  for (const lvl of ["ERROR", "WARN", "INFO", "DEBUG", "TRACE", "OTHER"] as const) {
    const bucket = grouped.get(lvl) || [];
    const take = sampleArray(bucket, cfg.samplePerLevel);
    sampled.push(...take);
  }

  // Deduplicate by id while keeping order preference: pinned > stacked > sampled (recentness preserved by slice)
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

  return {
    pinnedText,
    otherText,
    totalPinned: pinned.length,
    totalOthers: otherText ? otherText.split("\n").length : 0,
  };
}

async function streamOpenAI(params: {
  endpoint: string;
  key: string;
  body: any;
  signal?: AbortSignal;
  onToken: (t: string) => void;
}) {
  const res = await fetch(params.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...params.body, stream: true }),
    signal: params.signal,
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    done = d;
    if (value) {
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content ?? "";
          if (token) params.onToken(token);
        } catch {}
      }
    }
  }
}

async function streamOpenRouter(params: {
  key: string;
  body: any;
  signal?: AbortSignal;
  onToken: (t: string) => void;
}) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...params.body, stream: true }),
    signal: params.signal,
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    done = d;
    if (value) {
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content ?? "";
          if (token) params.onToken(token);
        } catch {}
      }
    }
  }
}

// Ollama streaming: /api/chat con stream true
async function streamOllama(params: {
  endpoint: string; // es. http://localhost:11434
  model: string;
  messages: Message[];
  signal?: AbortSignal;
  onToken: (t: string) => void;
}) {
  const res = await fetch(`${params.endpoint.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    }),
    signal: params.signal,
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // Ollama invia JSON ND-stream: una riga per token
    const lines = chunk.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        const t = data?.message?.content || "";
        if (t) params.onToken(t);
      } catch {
        // ignora frammenti incompleti
      }
    }
  }
}

async function callLLM(params: {
  provider: Provider;
  model: string;
  apiKey?: string;
  messages: Message[];
  abortSignal?: AbortSignal;
  onToken?: (t: string) => void;
  ollamaEndpoint?: string;
}): Promise<string> {
  const { provider, model, apiKey, messages, abortSignal, onToken, ollamaEndpoint } = params;

  const getKeyFallback = () => {
    if (apiKey && apiKey.trim()) return apiKey.trim();
    if (typeof window !== "undefined") {
      const k =
        (window as any).ENV_OPENAI_API_KEY ||
        (window as any).ENV_DEEPSEEK_API_KEY ||
        (window as any).ENV_OPENROUTER_API_KEY;
      if (k) return k;
    }
    return undefined;
  };

  const body = { model, messages, temperature: 0.2 };

  if (provider === "openai") {
    const key = apiKey || getKeyFallback() || (process.env.OPENAI_API_KEY as string | undefined);
    if (!key) throw new Error("OPENAI_API_KEY mancante. Inserisci la chiave nel pannello.");
    if (onToken) {
      await streamOpenAI({
        endpoint: "https://api.openai.com/v1/chat/completions",
        key,
        body,
        signal: abortSignal,
        onToken,
      });
      return "";
    }
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
    const key = apiKey || getKeyFallback() || (process.env.DEEPSEEK_API_KEY as string | undefined);
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
    if (onToken) {
      await streamOllama({
        endpoint,
        model,
        messages,
        signal: abortSignal,
        onToken,
      });
      return "";
    }
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
      }),
      signal: abortSignal,
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const content: string = data?.message?.content ?? "";
    return content;
  }

  // openrouter
  const key = apiKey || getKeyFallback() || (process.env.OPENROUTER_API_KEY as string | undefined);
  if (!key) throw new Error("OPENROUTER_API_KEY mancante. Inserisci la chiave nel pannello.");
  if (onToken) {
    await streamOpenRouter({ key, body, signal: abortSignal, onToken });
    return "";
  }
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

// Nuova chiave versionata (bumped per Ollama)
const LS_KEY = "logviewer.chat.config.v4";

const DEFAULT_PROVIDER: Provider = "openrouter";
const DEFAULT_MODEL = "openrouter/horizon-beta";
const DEFAULT_API_KEY = "";

// Config persistita
type SavedConfig = {
  provider: Provider;
  model: string;
  apiKey: string;
  compression: CompressionConfig;
  ollamaEndpoint?: string;
};

export default function ChatSidebar({ lines, pinnedIds, filter, className }: Props) {
  const [open, setOpen] = React.useState(true);
  const [provider, setProvider] = React.useState<Provider>(DEFAULT_PROVIDER);
  const [model, setModel] = React.useState<string>(DEFAULT_MODEL);
  const [apiKey, setApiKey] = React.useState<string>(DEFAULT_API_KEY);
  const [ollamaEndpoint, setOllamaEndpoint] = React.useState<string>("http://localhost:11434");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ]);
  const [loading, setLoading] = React.useState(false);
  const [streamBuffer, setStreamBuffer] = React.useState<string>("");
  const abortRef = React.useRef<AbortController | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // Compression settings
  const [compression, setCompression] = React.useState<CompressionConfig>(DEFAULT_COMPRESSION);
  const [enableCompression, setEnableCompression] = React.useState(true);

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
      if (parsed.ollamaEndpoint) {
        setOllamaEndpoint(parsed.ollamaEndpoint);
      }
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
      if (provider === "openrouter") return prev || DEFAULT_MODEL;
      if (provider === "ollama") return prev || "llama3"; // default locale
      const first = PROVIDER_MODELS[provider].models[0]?.id;
      return first ?? prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const buildContextText = React.useCallback(() => {
    if (!enableCompression) {
      // fallback to simple last-N strategy with truncation to avoid pathological long lines
      const maxPinned = 150;
      const maxOthers = 250;
      const maxLineChars = 220;
      const pinnedSet = new Set(pinnedIds);
      const pinned = lines.filter(l => pinnedSet.has(l.id)).slice(-maxPinned);
      const others = lines.filter(l => !pinnedSet.has(l.id)).slice(-maxOthers);
      const serialize = (arr: LogLine[]) => arr.map(l => serializeLine(l, maxLineChars)).join("\n");
      return {
        pinnedText: serialize(pinned),
        otherText: serialize(others),
        totalPinned: pinned.length,
        totalOthers: others.length,
      };
    }
    return pickContextCompressed(lines, pinnedIds, compression);
  }, [enableCompression, lines, pinnedIds, compression]);

  const send = async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q) return;

    setMessages((prev) => [...prev.filter(m => m.role !== "system"), { role: "user", content: q }]);
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
      ...messages.filter(m => m.role !== "system"),
      { role: "user", content: userContent },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await callLLM({
        provider,
        model,
        apiKey,
        messages: nextMessages,
        abortSignal: controller.signal,
        onToken: (t) => setStreamBuffer((prev) => prev + t),
        ollamaEndpoint,
      });
      if (streamBuffer.length === 0) {
        const full = await callLLM({
          provider,
          model,
          apiKey,
          messages: nextMessages,
          abortSignal: controller.signal,
          ollamaEndpoint,
        });
        setMessages((prev) => [...prev, { role: "assistant", content: full }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: streamBuffer }]);
        setStreamBuffer("");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  return (
    <div className={cn("h-full flex flex-col border-l bg-transparent", className)} style={{ width: open ? 460 : 56 }}>
      <div className="p-2 h-full">
        <Card className="h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-2 py-2 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              {open && <span className="text-sm font-medium">Chat Log Assistant</span>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => setOpen(o => !o)} title={open ? "Chiudi" : "Apri"}>
              {open ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>

          {open && (
            <div className="p-2 space-y-2 border-b shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Provider</label>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as Provider)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="ollama">Ollama (locale)</option>
                </select>

                <label className="text-xs text-muted-foreground">Modello</label>
                {provider === "openrouter" ? (
                  <Input
                    className="h-8"
                    placeholder="es. anthropic/claude-3.7, openrouter/auto, meta-llama/..."
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                ) : provider === "ollama" ? (
                  <Input
                    className="h-8"
                    placeholder="es. llama3, qwen2.5, mistral, codellama..."
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                ) : (
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {PROVIDER_MODELS[provider].models.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                )}

                {provider === "ollama" && (
                  <>
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Server className="h-3.5 w-3.5" />
                      Endpoint
                    </label>
                    <Input
                      className="h-8"
                      placeholder="http://localhost:11434"
                      value={ollamaEndpoint}
                      onChange={(e) => setOllamaEndpoint(e.target.value)}
                    />
                  </>
                )}
              </div>

              {provider !== "ollama" && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">API Key</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Settings2 className="h-3 w-3" />
                      <span>Usa env o inserisci qui</span>
                    </div>
                  </div>
                  <Input
                    type="password"
                    placeholder="Incolla la tua API key (opzionale)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="h-8"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <Switch id="compression" checked={enableCompression} onCheckedChange={setEnableCompression} />
                  <label htmlFor="compression" className="text-xs text-muted-foreground flex items-center gap-1">
                    <Scissors className="h-3.5 w-3.5" />
                    Compressione contesto
                  </label>
                </div>
                <div className="text-[10px] text-muted-foreground text-right">
                  Riduce i token su file grandi
                </div>

                <label className="text-xs text-muted-foreground">Max pinned</label>
                <Input
                  className="h-8"
                  type="number"
                  min={20}
                  max={500}
                  value={compression.maxPinned}
                  onChange={(e) => setCompression((c) => ({ ...c, maxPinned: Number(e.target.value) }))}
                />

                <label className="text-xs text-muted-foreground">Max altri</label>
                <Input
                  className="h-8"
                  type="number"
                  min={40}
                  max={1000}
                  value={compression.maxOthers}
                  onChange={(e) => setCompression((c) => ({ ...c, maxOthers: Number(e.target.value) }))}
                />

                <label className="text-xs text-muted-foreground">Chars per riga</label>
                <Input
                  className="h-8"
                  type="number"
                  min={80}
                  max={2000}
                  value={compression.maxLineChars}
                  onChange={(e) => setCompression((c) => ({ ...c, maxLineChars: Number(e.target.value) }))}
                />

                <label className="text-xs text-muted-foreground">Sample per livello</label>
                <Input
                  className="h-8"
                  type="number"
                  min={5}
                  max={200}
                  value={compression.samplePerLevel}
                  onChange={(e) => setCompression((c) => ({ ...c, samplePerLevel: Number(e.target.value) }))}
                />

                <div className="col-span-2 flex items-center gap-2">
                  <Switch
                    id="include-stacks"
                    checked={compression.includeStacks}
                    onCheckedChange={(v) => setCompression((c) => ({ ...c, includeStacks: v }))}
                  />
                  <label htmlFor="include-stacks" className="text-xs text-muted-foreground">
                    Mantieni piccoli burst consecutivi di ERROR/WARN
                  </label>
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground">
                Le righe pinned hanno priorità nel contesto (non vengono mostrate qui).
              </div>
            </div>
          )}

          {open && (
            <div ref={listRef} className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
              {messages
                .filter(m => m.role !== "system")
                .map((m, idx) => (
                  <Card key={idx} className={cn("p-2 text-sm", m.role === "assistant" ? "bg-muted/50" : "bg-transparent")}>
                    {m.role === "assistant" ? (
                      <MessageContent text={m.content} />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    )}
                  </Card>
                ))}
              {loading && streamBuffer && (
                <Card className="p-2 text-sm bg-muted/50">
                  <MessageContent text={streamBuffer} />
                </Card>
              )}
              {loading && !streamBuffer && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generazione in corso…
                </div>
              )}
            </div>
          )}

          {open && (
            <div className="p-2 border-t shrink-0">
              <div className="flex gap-2">
                <Input
                  placeholder="Scrivi la tua domanda…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!loading) send();
                    }
                  }}
                />
                <Button onClick={() => send()} disabled={loading || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
                {loading && (
                  <Button variant="outline" onClick={stop}>
                    Stop
                  </Button>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Switch id="inc-prompt" checked disabled />
                <label htmlFor="inc-prompt" className="text-xs text-muted-foreground">
                  Prompt di sistema per analisi log sempre attivo
                </label>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}