"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings2, Scissors, Server } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

type Provider = "openai" | "deepseek" | "openrouter" | "ollama";

export type CompressionConfig = {
  maxPinned: number;
  maxOthers: number;
  maxLineChars: number;
  samplePerLevel: number;
  includeStacks: boolean;
};

type ProviderModels = Record<Exclude<Provider, "ollama">, { label: string; models: { id: string; label: string }[] }>;

type Props = {
  provider: Provider;
  setProvider: (p: Provider) => void;
  model: string;
  setModel: (m: string) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  ollamaEndpoint: string;
  setOllamaEndpoint: (s: string) => void;
  enableCompression: boolean;
  setEnableCompression: (v: boolean) => void;
  compression: CompressionConfig;
  setCompression: React.Dispatch<React.SetStateAction<CompressionConfig>>;
  providerModels: ProviderModels;
};

export default function ChatSettings({
  provider,
  setProvider,
  model,
  setModel,
  apiKey,
  setApiKey,
  ollamaEndpoint,
  setOllamaEndpoint,
  enableCompression,
  setEnableCompression,
  compression,
  setCompression,
  providerModels,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="p-2 space-y-3 border-b shrink-0">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Settings2 className="h-4 w-4" />
        <span>{t("provider")}</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-muted-foreground">Provider</label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
        >
          <option value="openrouter">OpenRouter</option>
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="ollama">Ollama (locale)</option>
        </select>
      </div>

      {provider !== "ollama" ? (
        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs text-muted-foreground">{t("model")}</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {providerModels[provider as Exclude<Provider, "ollama">]?.models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs text-muted-foreground">{t("model")}</label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ollama model (es. llama3)"
          />
        </div>
      )}

      {provider === "ollama" ? (
        <div className="grid grid-cols-1 gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
            Endpoint Ollama
          </label>
          <Input
            value={ollamaEndpoint}
            onChange={(e) => setOllamaEndpoint(e.target.value)}
            placeholder="http://localhost:11434"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1">
          <label className="text-xs text-muted-foreground">{t("api_key")}</label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("api_key_hint")}
          />
          <div className="text-[11px] text-muted-foreground">
            {t("api_key_hint")}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Scissors className="h-4 w-4" />
          <span>{t("compression")}</span>
        </div>
        <Switch checked={enableCompression} onCheckedChange={setEnableCompression} />
      </div>

      {enableCompression && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            {t("max_pinned")}
            <Input
              type="number"
              value={compression.maxPinned}
              min={0}
              max={1000}
              onChange={(e) =>
                setCompression((c) => ({ ...c, maxPinned: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            {t("max_others")}
            <Input
              type="number"
              value={compression.maxOthers}
              min={0}
              max={2000}
              onChange={(e) =>
                setCompression((c) => ({ ...c, maxOthers: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            {t("chars_per_line")}
            <Input
              type="number"
              value={compression.maxLineChars}
              min={40}
              max={2000}
              onChange={(e) =>
                setCompression((c) => ({ ...c, maxLineChars: Math.max(40, Number(e.target.value) || 40) }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            {t("sample_per_level")}
            <Input
              type="number"
              value={compression.samplePerLevel}
              min={0}
              max={200}
              onChange={(e) =>
                setCompression((c) => ({ ...c, samplePerLevel: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="flex items-center gap-2 col-span-2">
            <Switch
              checked={compression.includeStacks}
              onCheckedChange={(v) => setCompression((c) => ({ ...c, includeStacks: v }))}
            />
            <span>{t("keep_stacks")}</span>
          </label>
          <div className="col-span-2 text-[11px] text-muted-foreground">
            {t("compression_hint")}
          </div>
        </div>
      )}
    </div>
  );
}