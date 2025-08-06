"use client";

export type LargeFileIndex = {
  fileName: string;
  size: number;
  offsets: Uint32Array | BigUint64Array;
  totalLines: number;
  readLines: (fromLine: number, toLine: number) => Promise<string[]>;
};

const TEXT_DECODER = new TextDecoder();

export async function buildLargeFileIndex(file: File, options?: { chunkSize?: number }): Promise<LargeFileIndex> {
  const chunkSize = options?.chunkSize ?? 16 * 1024 * 1024;
  const fileSize = file.size;

  let capacity = Math.max(1024, Math.floor(fileSize / 48));
  let use64 = fileSize > 0xffffffff;
  let buf = use64 ? new BigUint64Array(capacity + 2) : new Uint32Array(capacity + 2);
  let count = 0;

  // Prima riga parte a 0
  if (use64) (buf as BigUint64Array)[count++] = 0n;
  else (buf as Uint32Array)[count++] = 0;

  let bytePos = 0;
  let leftover: Uint8Array | null = null;

  while (bytePos < fileSize) {
    const end = Math.min(bytePos + chunkSize, fileSize);
    const slice = file.slice(bytePos, end);
    const arr = new Uint8Array(await slice.arrayBuffer());

    let data: Uint8Array;
    if (leftover && leftover.length) {
      data = new Uint8Array(leftover.length + arr.length);
      data.set(leftover, 0);
      data.set(arr, leftover.length);
      leftover = null;
    } else {
      data = arr;
    }

    // Trova \n; registra l'inizio della riga successiva
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 10) {
        const absNext = bytePos + i + 1 - (leftover ? leftover.length : 0);
        if (count >= buf.length) buf = growBuffer(buf);
        if (use64) (buf as BigUint64Array)[count++] = BigInt(absNext);
        else (buf as Uint32Array)[count++] = absNext >>> 0;
      }
    }

    // Mantieni una coda breve solo se l'ultimo byte NON è \n
    if (data.length && data[data.length - 1] !== 10) {
      const keep = Math.min(1024, data.length);
      leftover = data.slice(data.length - keep);
    } else {
      leftover = null;
    }

    bytePos = end;
  }

  // Se il file termina con \n, l'ultimo offset punta a EOF e NON deve generare una riga vuota:
  const totalLines = count;
  const offsets = (buf as typeof buf).subarray(0, totalLines);

  async function readLines(fromLine: number, toLine: number): Promise<string[]> {
    const from = Math.max(1, Math.min(totalLines, fromLine));
    const to = Math.max(from, Math.min(totalLines, toLine));
    if (to < from) return [];

    const startByte = getOffset(offsets, use64, from - 1);
    // Se 'to' è l'ultima riga e il file non termina con \n, endByte = fileSize; altrimenti è l'offset della riga successiva.
    const endByte = to < totalLines ? getOffset(offsets, use64, to) : BigInt(fileSize);

    const slice = await file.slice(Number(startByte), Number(endByte)).arrayBuffer();
    const raw = new Uint8Array(slice);

    const out: string[] = [];
    for (let i = from; i <= to; i++) {
      const bStart = Number(getOffset(offsets, use64, i - 1) - startByte);
      const bEnd = i < totalLines ? Number(getOffset(offsets, use64, i) - startByte) : raw.length;
      let seg = raw.subarray(bStart, bEnd);
      // Trim CR/LF finali
      if (seg.length && seg[seg.length - 1] === 10) seg = seg.subarray(0, seg.length - 1);
      if (seg.length && seg[seg.length - 1] === 13) seg = seg.subarray(0, seg.length - 1);
      out.push(TEXT_DECODER.decode(seg));
    }
    // Rimuove eventuale ultima stringa vuota se derivasse da EOF con newline
    while (out.length && out[out.length - 1] === "") out.pop();
    return out;
  }

  return {
    fileName: file.name,
    size: fileSize,
    offsets,
    totalLines,
    readLines,
  };
}

function growBuffer(buf: Uint32Array | BigUint64Array) {
  if (buf instanceof BigUint64Array) {
    const bigger = new BigUint64Array(Math.floor(buf.length * 1.6) + 2048);
    bigger.set(buf);
    return bigger;
  } else {
    const bigger = new Uint32Array(Math.floor(buf.length * 1.6) + 2048);
    bigger.set(buf);
    return bigger;
  }
}

function getOffset(arr: Uint32Array | BigUint64Array, use64: boolean, idx: number): bigint {
  return use64 ? (arr as BigUint64Array)[idx] : BigInt((arr as Uint32Array)[idx]);
}