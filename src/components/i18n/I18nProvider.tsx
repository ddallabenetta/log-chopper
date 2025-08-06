"use client";

import * as React from "react";

type Locale = "it" | "en";

type Messages = Record<string, string>;

const IT: Messages = {
  app_title: "Log Chopper",
  made_with: "Creato con 🤖 da @ddallabenetta",
  github_title: "Vai al repository GitHub",
  install_app: "Installa app",
  header_language: "Lingua",
  // LogControls
  upload_logs: "Carica log",
  clear: "Svuota",
  filter_text_placeholder: "Filtra per testo (es: error)",
  filter_regex_placeholder: "Filtra per regex (es: error|warn)",
  text: "Testo",
  regex: "Regex",
  case_sensitive: "Case sensitive",
  filter: "Filtro",
  level_all: "Tutti",
  level_trace: "Trace",
  level_debug: "Debug",
  level_info: "Info",
  level_warn: "Warn",
  level_error: "Error",
  level_other: "Altro",
  pinned: "Pinned",
  totals: "Totali",
  visible: "Visibili",
  max_lines: "Max righe",
  go_bottom: "Vai in fondo",
  drop_files_here: "Rilascia i file .log qui",
  // Chat
  chat_title: "Chat Log Assistant",
  provider: "Provider",
  model: "Modello",
  api_key: "API Key",
  api_key_hint: "Usa env o inserisci qui",
  compression: "Compressione contesto",
  compression_hint: "Riduce i token su file grandi",
  max_pinned: "Max pinned",
  max_others: "Max altri",
  chars_per_line: "Chars per riga",
  sample_per_level: "Sample per livello",
  keep_stacks: "Mantieni piccoli burst consecutivi di ERROR/WARN",
  pinned_priority_hint: "Le righe pinned hanno priorità nel contesto (non vengono mostrate qui).",
  ask_placeholder: "Scrivi la tua domanda…",
  generating: "Generazione in corso…",
  stop: "Stop",
  system_prompt_always_on: "Prompt di sistema per analisi log sempre attivo",
  // Log line detail
  expand: "Espandi",
  collapse: "Comprimi",
  fullscreen: "Schermo intero",
  exit_fullscreen: "Esci da schermo intero",
  copy: "Copia",
  copy_json: "Copia JSON",
  content: "Contenuto",
  content_pretty: "Contenuto (JSON colorato)",
  content_graph: "Contenuto (grafico)",
  no_results: "Nessun risultato.",
};

const EN: Messages = {
  app_title: "Log Chopper",
  made_with: "Made with 🤖 by @ddallabenetta",
  github_title: "Open GitHub repository",
  install_app: "Install app",
  header_language: "Language",
  // LogControls
  upload_logs: "Upload logs",
  clear: "Clear",
  filter_text_placeholder: "Filter by text (e.g. error)",
  filter_regex_placeholder: "Filter by regex (e.g. error|warn)",
  text: "Text",
  regex: "Regex",
  case_sensitive: "Case sensitive",
  filter: "Filter",
  level_all: "All",
  level_trace: "Trace",
  level_debug: "Debug",
  level_info: "Info",
  level_warn: "Warn",
  level_error: "Error",
  level_other: "Other",
  pinned: "Pinned",
  totals: "Totals",
  visible: "Visible",
  max_lines: "Max lines",
  go_bottom: "Go to bottom",
  drop_files_here: "Drop .log files here",
  // Chat
  chat_title: "Chat Log Assistant",
  provider: "Provider",
  model: "Model",
  api_key: "API Key",
  api_key_hint: "Use env or paste here",
  compression: "Context compression",
  compression_hint: "Reduces tokens on large files",
  max_pinned: "Max pinned",
  max_others: "Max others",
  chars_per_line: "Chars per line",
  sample_per_level: "Sample per level",
  keep_stacks: "Keep small consecutive ERROR/WARN bursts",
  pinned_priority_hint: "Pinned lines are prioritized (not shown here).",
  ask_placeholder: "Type your question…",
  generating: "Generating…",
  stop: "Stop",
  system_prompt_always_on: "System prompt for log analysis always on",
  // Log line detail
  expand: "Expand",
  collapse: "Collapse",
  fullscreen: "Fullscreen",
  exit_fullscreen: "Exit fullscreen",
  copy: "Copy",
  copy_json: "Copy JSON",
  content: "Content",
  content_pretty: "Content (colored JSON)",
  content_graph: "Content (graph)",
  no_results: "No results.",
};

const MESSAGES: Record<Locale, Messages> = { it: IT, en: EN };
const STORAGE_KEY = "logchopper.locale";

type I18nContextValue = {
  locale: Locale;
  t: (key: string) => string;
  setLocale: (l: Locale) => void;
  ready: boolean;
};

const I18nContext = React.createContext<I18nContextValue | undefined>(undefined);

// Per stabilità SSR: usa sempre "it" come default durante SSR
const DEFAULT_LOCALE: Locale = "it";

function detectSystemLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language || (navigator as any).userLanguage || DEFAULT_LOCALE;
  const norm = lang.toLowerCase();
  if (norm.startsWith("it")) return "it";
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // 1) Durante SSR/first render: fisso a "it"
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = React.useState(false);

  // 2) Dopo mount client: carica da localStorage o sistema e sblocca
  React.useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    const next = saved === "it" || saved === "en" ? saved : detectSystemLocale();
    setLocaleState(next);
    setReady(true);
  }, []);

  const setLocale = React.useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  }, []);

  const t = React.useCallback(
    (key: string) => {
      // Prima che sia pronto, usa sempre la mappa "it" per evitare mismatch
      const loc = ready ? locale : DEFAULT_LOCALE;
      return MESSAGES[loc][key] ?? key;
    },
    [locale, ready]
  );

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = (ready ? locale : DEFAULT_LOCALE) === "it" ? "it" : "en";
    }
  }, [locale, ready]);

  const value = React.useMemo(() => ({ locale, t, setLocale, ready }), [locale, t, setLocale, ready]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}