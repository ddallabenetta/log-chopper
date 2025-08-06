"use client";

import type { LogLevel, LogLine } from "../LogTypes";
import {
  idbAppendLogs,
  idbGetLastN,
  idbGetLogsByRange,
  idbUpdateFileTotal,
  idbGetFilesMeta,
} from "@/lib/idb";

export const TAIL_PREVIEW_DEFAULT = 50000;

export async function saveBatchToDb(batch: LogLine[]) {
  if (!batch.length) return;
  await idbAppendLogs(
    batch.map((l) => ({
      id: l.id,
      fileName: l.fileName,
      lineNumber: l.lineNumber,
      content: l.content,
      level: l.level,
    }))
  );
}

export async function updateFileTotal(fileName: string, totalLines: number) {
  await idbUpdateFileTotal(fileName, totalLines);
}

export async function readTailPreview(fileName: string, n: number = TAIL_PREVIEW_DEFAULT): Promise<LogLine[]> {
  const preview = await idbGetLastN(fileName, n);
  return preview.map((l) => ({
    id: l.id,
    fileName: l.fileName,
    lineNumber: l.lineNumber,
    content: l.content,
    level: (l.level as LogLevel) || "OTHER",
  })).sort((a, b) => a.lineNumber - b.lineNumber);
}

export async function readRange(fileName: string, from: number, to: number): Promise<LogLine[]> {
  const rows = await idbGetLogsByRange(fileName, from, to);
  return rows.map((l) => ({
    id: l.id,
    fileName: l.fileName,
    lineNumber: l.lineNumber,
    content: l.content,
    level: (l.level as LogLevel) || "OTHER",
  })).sort((a, b) => a.lineNumber - b.lineNumber);
}

export async function getFileMetaTotal(fileName: string): Promise<number> {
  const meta = await idbGetFilesMeta();
  const info = meta.find((m) => m.fileName === fileName);
  return info?.totalLines ?? 0;
}

export async function getAllFilesMeta(): Promise<{ fileName: string; totalLines: number }[]> {
  return idbGetFilesMeta();
}