"use client";

import type { LogLevel } from "../LogTypes";

export function detectLevel(text: string): LogLevel {
  const t = text.toUpperCase();
  if (/\bTRACE\b/.test(t)) return "TRACE";
  if (/\bDEBUG\b/.test(t)) return "DEBUG";
  if (/\bINFO\b/.test(t)) return "INFO";
  if (/\bWARN(ING)?\b/.test(t)) return "WARN";
  if (/\bERR(OR)?\b/.test(t)) return "ERROR";
  return "OTHER";
}

export async function* streamLines(file: File): AsyncGenerator<string, void, unknown> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let { value, done } = await reader.read();
  let chunk = value ? decoder.decode(value, { stream: true }) : "";
  let buffer = "";
  while (!done) {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      yield line.replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
    }
    ({ value, done } = await reader.read());
    chunk = value ? decoder.decode(value, { stream: true }) : "";
  }
  const tail = decoder.decode();
  if (tail) buffer += tail;
  if (buffer.length > 0) {
    yield buffer.replace(/\r$/, "");
  }
}

export function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}