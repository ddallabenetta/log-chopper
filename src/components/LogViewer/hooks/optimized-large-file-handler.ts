"use client";

import type { LogLine, LogLevel } from "../LogTypes";
import { detectLevel } from "./log-helpers";

export interface OptimizedLargeFileIndex {
  fileName: string;
  size: number;
  lineOffsets: BigUint64Array;
  totalLines: number;
  searchIndex?: Map<string, number[]>; // Cache per ricerche frequenti
  lastModified: number;
}

export interface StreamingSearchResult {
  matches: LogLine[];
  totalMatches: number;
  isComplete: boolean;
  progress: number;
}

const TEXT_DECODER = new TextDecoder();
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks per streaming
const SEARCH_CACHE_SIZE = 100; // Massimo 100 ricerche in cache

export class OptimizedLargeFileHandler {
  private file: File;
  private _index: OptimizedLargeFileIndex | null = null;
  private searchCache = new Map<string, number[]>();
  private worker: Worker | null = null;

  constructor(file: File) {
    this.file = file;
  }

  get index(): OptimizedLargeFileIndex | null {
    return this._index;
  }

  async buildIndex(): Promise<OptimizedLargeFileIndex> {
    if (this._index && this._index.lastModified === this.file.lastModified) {
      return this._index;
    }

    const fileSize = this.file.size;
    let capacity = Math.max(10000, Math.floor(fileSize / 64)); // Maggiore capacità iniziale
    let offsets = new BigUint64Array(capacity);
    let count = 0;

    // Prima riga inizia a 0
    offsets[count++] = 0n;

    let position = 0;
    // Chunks adattivi: file più grandi = chunks più grandi per efficienza
    const chunkSize = Math.floor(Math.min(
      CHUNK_SIZE * Math.min(32, Math.max(1, Math.floor(fileSize / (100 * 1024 * 1024)))), 
      fileSize / 50
    ));

    while (position < fileSize) {
      const end = Math.min(position + chunkSize, fileSize);
      const chunk = await this.file.slice(position, end).arrayBuffer();
      const bytes = new Uint8Array(chunk);

      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 10) { // \n
          const nextLineStart = position + i + 1;
          if (count >= offsets.length) {
            // Grow buffer più efficiente
            const newOffsets = new BigUint64Array(Math.floor(offsets.length * 1.5));
            newOffsets.set(offsets);
            offsets = newOffsets;
          }
          offsets[count++] = BigInt(nextLineStart);
        }
      }

      position = end;
    }

    // Trim array alla dimensione effettiva
    const finalOffsets = new BigUint64Array(count);
    finalOffsets.set(offsets.subarray(0, count));

    this._index = {
      fileName: this.file.name,
      size: fileSize,
      lineOffsets: finalOffsets,
      totalLines: count - 1, // Escludi l'ultimo offset se punta oltre EOF
      lastModified: this.file.lastModified,
    };

    return this._index;
  }

  async readLines(fromLine: number, toLine: number): Promise<LogLine[]> {
    if (!this._index) throw new Error("Index not built");

    const from = Math.max(1, Math.min(this._index.totalLines, fromLine));
    const to = Math.max(from, Math.min(this._index.totalLines, toLine));

    if (to < from) return [];

    const startByte = Number(this._index.lineOffsets[from - 1]);
    const endByte = to < this._index.totalLines 
      ? Number(this._index.lineOffsets[to]) 
      : this._index.size;

    const chunk = await this.file.slice(startByte, endByte).arrayBuffer();
    const bytes = new Uint8Array(chunk);

    const lines: LogLine[] = [];
    let currentPos = 0;

    for (let lineNum = from; lineNum <= to; lineNum++) {
      const nextPos = lineNum < this._index.totalLines 
        ? Number(this._index.lineOffsets[lineNum] - this._index.lineOffsets[from - 1])
        : bytes.length;

      let lineBytes = bytes.subarray(currentPos, nextPos);
      
      // Rimuovi CR/LF finali
      if (lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 10) {
        lineBytes = lineBytes.subarray(0, lineBytes.length - 1);
      }
      if (lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 13) {
        lineBytes = lineBytes.subarray(0, lineBytes.length - 1);
      }

      const content = TEXT_DECODER.decode(lineBytes);
      
      lines.push({
        id: `${this.file.name}:${lineNum}`,
        fileName: this.file.name,
        lineNumber: lineNum,
        content,
        level: detectLevel(content),
      });

      currentPos = nextPos;
    }

    return lines;
  }

  // Ricerca ottimizzata con streaming e caching
  async *searchStream(
    query: string, 
    options: {
      mode: "text" | "regex";
      caseSensitive: boolean;
      maxResults?: number;
    }
  ): AsyncGenerator<StreamingSearchResult, void, unknown> {
    if (!this._index) throw new Error("Index not built");

    const cacheKey = `${query}:${options.mode}:${options.caseSensitive}`;
    
    // Controlla cache
    if (this.searchCache.has(cacheKey)) {
      const cachedLines = this.searchCache.get(cacheKey)!;
      const matches = await this.readLines(cachedLines[0], cachedLines[cachedLines.length - 1]);
      
      yield {
        matches: matches.filter(line => this.matchesQuery(line.content, query, options)),
        totalMatches: cachedLines.length,
        isComplete: true,
        progress: 1.0,
      };
      return;
    }

    const matchingLines: number[] = [];
    const batchSize = 10000; // Righe per batch
    const maxResults = options.maxResults || Infinity;

    let processed = 0;
    const total = this._index.totalLines;

    // Utilizza Web Worker per ricerca intensiva se disponibile
    if (typeof Worker !== 'undefined' && this.worker) {
      // Implementazione con Web Worker per non bloccare UI
      yield* this.searchWithWorker(query, options);
      return;
    }

    // Fallback: ricerca diretta con batching
    for (let start = 1; start <= total && matchingLines.length < maxResults; start += batchSize) {
      const end = Math.min(start + batchSize - 1, total);
      const batch = await this.readLines(start, end);
      
      const batchMatches: LogLine[] = [];
      for (const line of batch) {
        if (this.matchesQuery(line.content, query, options)) {
          matchingLines.push(line.lineNumber);
          batchMatches.push(line);
          
          if (matchingLines.length >= maxResults) break;
        }
      }

      processed = end;
      
      yield {
        matches: batchMatches,
        totalMatches: matchingLines.length,
        isComplete: processed >= total,
        progress: processed / total,
      };
    }

    // Cache i risultati se non troppo grandi
    if (matchingLines.length > 0 && matchingLines.length < 10000) {
      if (this.searchCache.size >= SEARCH_CACHE_SIZE) {
        // Remove oldest cache entry
        const firstKey = this.searchCache.keys().next().value;
        if (firstKey !== undefined) {
          this.searchCache.delete(firstKey);
        }
      }
      this.searchCache.set(cacheKey, matchingLines);
    }
  }

  private async *searchWithWorker(
    query: string,
    options: { mode: "text" | "regex"; caseSensitive: boolean; maxResults?: number }
  ): AsyncGenerator<StreamingSearchResult, void, unknown> {
    // Implementazione con Web Worker per ricerca parallela
    // TODO: Implementare Web Worker dedicato per ricerche pesanti
    yield* this.searchStream(query, options); // Fallback temporaneo
  }

  private matchesQuery(
    content: string,
    query: string,
    options: { mode: "text" | "regex"; caseSensitive: boolean }
  ): boolean {
    if (!query) return true;

    if (options.mode === "regex") {
      try {
        const flags = options.caseSensitive ? "g" : "gi";
        const regex = new RegExp(query, flags);
        return regex.test(content);
      } catch {
        return false;
      }
    }

    const text = options.caseSensitive ? content : content.toLowerCase();
    const needle = options.caseSensitive ? query : query.toLowerCase();
    return text.includes(needle);
  }

  // Navigazione rapida per jump ottimizzato
  async jumpToLine(lineNumber: number, context: number = 50): Promise<LogLine[]> {
    if (!this._index) throw new Error("Index not built");

    const targetLine = Math.max(1, Math.min(this._index.totalLines, lineNumber));
    const contextStart = Math.max(1, targetLine - context);
    const contextEnd = Math.min(this._index.totalLines, targetLine + context);

    return this.readLines(contextStart, contextEnd);
  }

  // Ottimizzazione per tail seguimento
  async tail(numLines: number = 1000): Promise<LogLine[]> {
    if (!this._index) throw new Error("Index not built");

    const startLine = Math.max(1, this._index.totalLines - numLines + 1);
    return this.readLines(startLine, this._index.totalLines);
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.searchCache.clear();
    this._index = null;
  }
}

// Factory per creare handler ottimizzato
export async function createOptimizedLargeHandler(file: File): Promise<OptimizedLargeFileHandler> {
  const handler = new OptimizedLargeFileHandler(file);
  await handler.buildIndex();
  return handler;
}