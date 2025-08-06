"use client";

import type { LogLine, LogLevel } from "../LogTypes";
import { readRange, readTailPreview, getFileMetaTotal } from "./log-pagination";
import { buildLargeFileIndex, type LargeFileIndex } from "./large-file-index";
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

// Heuristics
export const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB