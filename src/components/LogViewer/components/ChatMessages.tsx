"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import MessageContent from "../MessageContent";
import { useI18n } from "@/components/i18n/I18nProvider";

type Message = { role: "system" | "user" | "assistant"; content: string };

type Props = {
  messages: Message[];
  loading: boolean;
  streamBuffer: string;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  listRef: React.RefObject<HTMLDivElement>;
};

export default function ChatMessages({
  messages,
  loading,
  streamBuffer,
  input,
  setInput,
  onSend,
  onStop,
  listRef,
}: Props) {
  const { t } = useI18n();

  return (
    <>
      <div ref={listRef} className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
        {messages
          .filter((m) => m.role !== "system")
          .map((m, idx) => (
            <Card key={idx} className={cn("p-2 text-sm", m.role === "assistant" ? "bg-muted/50" : "bg-transparent")}>
              {m.role === "assistant" ? (
                <MessageContent text={m.content} />
              ) : (
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
              )}
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
                if (!loading) onSend();
              }
            }}
          />
          <Button onClick={onSend} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
          {loading && (
            <Button variant="outline" onClick={onStop}>
              {t("stop")}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}