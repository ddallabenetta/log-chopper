"use client";

import * as React from "react";
import { Send, Bot, PanelRightClose, PanelRightOpen, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LogLine, FilterConfig } from "./LogTypes";

type Provider = "openai" | "deepseek" | "openrouter";

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

const PROVIDER_MODELS: Record<Provider, { label: string; models: { id: string; label: string }[] }> = {
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
      { id: "openrouter/auto", label: "auto" },
      { id: "anthropic/claude-3.5-sonnet", label: "claude-3.5-sonnet" },
      { id: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini" },
    ],
  },
};

function pickContext(lines: LogLine[], pinnedIds: string[], maxPinned = 150, maxOthers = 250) {
  const pinnedSet = new Set(pinnedIds);
  const pinned = lines.filter(l => pinnedSet.has(l.id)).slice(-maxPinned);
  // campionamento semplice: prendiamo le ultime non pinned che passano il filtro visuale già applicato a monte
  const others = lines.filter(l => !pinnedSet.has(l.id)).slice(-maxOthers);
  const serialize = (arr: LogLine[]) =>
    arr.map(l => `[${l.level}] ${l.fileName}:${l.lineNumber} ${l.content}`).join("\n");
  return {
    pinnedText: serialize(pinned),
    otherText: serialize(others),
    totalPinned: pinned.length,
    totalOthers: others.length,
  };
}

async function callLLM(params: {
  provider: Provider;
  model: string;
  apiKey?: string;
  messages: Message[];
  abortSignal?: AbortSignal;
}): Promise<string> {
  const { provider, model, apiKey, messages, abortSignal } = params;

  const getKeyFallback = () => {
    if (apiKey && apiKey.trim()) return apiKey.trim();
    if (typeof window !== "undefined") {
      // Best-effort: tentiamo da env esposti; se non presenti, l'utente deve inserirla nel campo.
      const k =
        (window as any).ENV_OPENAI_API_KEY ||
        (window as any).ENV_DEEPSEEK_API_KEY ||
        (window as any).ENV_OPENROUTER_API_KEY;
      if (k) return k;
    }
    return undefined;
  };

  // Costruiamo payload OpenAI-compatible
  const body = {
    model,
    messages,
    temperature: 0.2,
  };

  if (provider === "openai") {
    const key = apiKey || getKeyFallback() || (process.env.OPENAI_API_KEY as string | undefined);
    if (!key) throw new Error("OPENAI_API_KEY mancante. Inserisci la chiave nel pannello.");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
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
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok) throw new Error(`DeepSeek error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  // openrouter
  const key = apiKey || getKeyFallback() || (process.env.OPENROUTER_API_KEY as string | undefined);
  if (!key) throw new Error("OPENROUTER_API_KEY mancante. Inserisci la chiave nel pannello.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export default function ChatSidebar({ lines, pinnedIds, filter, className }: Props) {
  const [open, setOpen] = React.useState(true);
  const [provider, setProvider] = React.useState<Provider>("openai");
  const [model, setModel] = React.useState<string>(PROVIDER_MODELS.openai.models[0].id);
  const [apiKey, setApiKey] = React.useState<string>("");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([
    { role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ]);
  const [loading, setLoading] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setModel(PROVIDER_MODELS[provider].models[0].id);
  }, [provider]);

  const send = async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q) return;
    const { pinnedText, otherText, totalPinned, totalOthers } = pickContext(lines, pinnedIds);
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
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const answer = await callLLM({
        provider,
        model,
        apiKey,
        messages: nextMessages,
        abortSignal: controller.signal,
      });
      setMessages(prev => [...prev, { role: "assistant", content: answer }]);
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
    <div className={cn("h-full flex flex-col border-l bg-card", className)} style={{ width: open ? 380 : 48 }}>
      <div className="flex items-center justify-between px-2 py-2 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          {open && <span className="text-sm font-medium">Chat Log Assistant</span>}
        </div>
        <Button size="icon" variant="ghost" onClick={() => setOpen(o => !o)} title={open ? "Chiudi" : "Apri"}>
          {open ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>
      </div>

      {open && (
        <div className="p-2 space-y-2 border-b">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">Provider</label>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              {Object.entries(PROVIDER_MODELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>

            <label className="text-xs text-muted-foreground">Modello</label>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {PROVIDER_MODELS[provider].models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

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

          <div className="text-[10px] text-muted-foreground">
            Verranno inviate prima le righe pinnate, poi un campione delle altre righe visibili.
          </div>
        </div>
      )}

      {open && (
        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
          {messages
            .filter(m => m.role !== "system")
            .map((m, idx) => (
              <Card key={idx} className={cn("p-2 text-sm", m.role === "assistant" ? "bg-muted/50" : "bg-transparent")}>
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
              </Card>
            ))}
        </div>
      )}

      {open && (
        <div className="p-2 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Chiedi di analizzare gli errori…"
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
    </div>
  );
}