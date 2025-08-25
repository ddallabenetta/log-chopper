"use client";

import type { LogLine, LogLevel } from "../LogTypes";
import { readRange, readTailPreview, getFileMetaTotal } from "./log-pagination";
import { buildLargeFileIndex, type LargeFileIndex } from "./large-file-index";
import { createOptimizedLargeHandler, OptimizedLargeFileHandler } from "./optimized-large-file-handler";
import { detectLevel } from "./log-helpers";

export type LineProvider =
  | {
      kind: "idb";
      fileName: string;
      totalLines: () => Promise<number>;
      tail: (n: number) => Promise<LogLine[]>;
      range: (from: number, to: number) => Promise<LogLine[]>;
      dispose?: () => void;
    }
  | {
      kind: "large";
      fileName: string;
      totalLines: () => Promise<number>;
      tail: (n: number) => Promise<LogLine[]>;
      range: (from: number, to: number) => Promise<LogLine[]>;
      dispose?: () => void;
    }
  | {
      kind: "optimized-large";
      fileName: string;
      handler: OptimizedLargeFileHandler;
      totalLines: () => Promise<number>;
      tail: (n: number) => Promise<LogLine[]>;
      range: (from: number, to: number) => Promise<LogLine[]>;
      jumpToLine: (lineNumber: number, context?: number) => Promise<LogLine[]>;
      searchStream: (query: string, options: {
        mode: "text" | "regex";
        caseSensitive: boolean;
        maxResults?: number;
      }) => AsyncGenerator<{matches: LogLine[], totalMatches: number, isComplete: boolean, progress: number}, void, unknown>;
      dispose?: () => void;
    };

export async function createIdbProvider(fileName: string): Promise<LineProvider> {
  return {
    kind: "idb",
    fileName,
    totalLines: () => getFileMetaTotal(fileName),
    tail: (n) => readTailPreview(fileName, n),
    range: (from, to) => readRange(fileName, from, to),
  };
}

export async function createLargeProvider(file: File): Promise<LineProvider> {
  const index = await buildLargeFileIndex(file);

  async function toLogLines(lines: string[], startLine: number): Promise<LogLine[]> {
    const fileName = index.fileName;
    const out: LogLine[] = new Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = startLine + i;
      const content = lines[i];
      const id = `${fileName}:${lineNumber}`;
      const level = detectLevel(content);
      out[i] = { id, fileName, lineNumber, content, level };
    }
    return out;
  }

  return {
    kind: "large",
    fileName: index.fileName,
    totalLines: async () => index.totalLines,
    tail: async (n) => {
      const total = index.totalLines;
      const from = Math.max(1, total - n + 1);
      const to = total;
      const lines = await index.readLines(from, to);
      return toLogLines(lines, from);
    },
    range: async (from, to) => {
      const lines = await index.readLines(from, to);
      return toLogLines(lines, from);
    },
    dispose: () => {
      // GC-friendly: lasciamo che le TypedArray vengano raccolte
      // Se servisse, potremmo azzerare riferimenti.
    },
  };
}

// Factory per provider ottimizzato per file molto grandi
export async function createOptimizedLargeProvider(file: File): Promise<LineProvider> {
  const handler = await createOptimizedLargeHandler(file);

  return {
    kind: "optimized-large",
    fileName: file.name,
    handler,
    totalLines: async () => (await handler.buildIndex()).totalLines,
    tail: async (n) => handler.tail(n),
    range: async (from, to) => handler.readLines(from, to),
    jumpToLine: async (lineNumber, context) => handler.jumpToLine(lineNumber, context),
    searchStream: (query, options) => handler.searchStream(query, options),
    dispose: () => handler.dispose(),
  };
}

// Heuristics
export const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
export const OPTIMIZED_LARGE_FILE_THRESHOLD = 500 * 1024 * 1024; // 500MB - per handler ottimizzato