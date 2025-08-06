"use client";

export type LargeFileIndex = {
  fileName: string;
  size: number;
  offsets: Uint32Array | BigUint64Array; // posizione byte inizio di ogni riga
  totalLines: number;
  // API per leggere finestre di righe
  readLines: (fromLine: number, toLine: number) => Promise<string[]>;
};

const TEXT_DECODER = new TextDecoder();

/**
 * Crea un indice leggero dei newline. Scansiona il file a chunk e colleziona gli offset byte
 * di inizio riga. L'indice permette accessi random (line -> slice byte) senza salvare su IndexedDB.
 */
export async function buildLargeFileIndex(file: File, options?: { chunkSize?: number }): Promise<LargeFileIndex> {
  const chunkSize = options?.chunkSize ?? 16 * 1024 * 1024; // 16MB
  const fileSize = file.size;

  // Stima righe iniziale (grezza) per evitare raddoppi continui. Crescerà se necessario.
  // Se non possiamo stimare, partiamo piccolo e facciamo grow dinamico.
  let capacity = Math.max(1024, Math.floor(fileSize / 48)); // euristica: ~48B per riga
  let use64 = fileSize > 0xffffffff; // >4GB richiede 64bit
  let buf = use64 ? new BigUint64Array(capacity + 1) : new Uint32Array(capacity + 1);
  let count = 0;

  // La prima riga inizia a 0
  if (use64) {
    (buf as BigUint64Array)[count++] = 0n;
  } else {
    (buf as Uint32Array)[count++] = 0;
  }

  let bytePos = 0;
  let leftover: Uint8Array | null = null;

  while (bytePos < fileSize) {
    const end = Math.min(bytePos + chunkSize, fileSize);
    const slice = file.slice(bytePos, end);
    const arr = new Uint8Array(await slice.arrayBuffer());

    // Concat leftover (linea spezzata sul chunk precedente)
    let data: Uint8Array;
    if (leftover && leftover.length) {
      data = new Uint8Array(leftover.length + arr.length);
      data.set(leftover, 0);
      data.set(arr, leftover.length);
      leftover = null;
    } else {
      data = arr;
    }

    // Scansiona per LF (10). Gestione CRLF: consideriamo LF come terminatore.
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 10 /* \n */) {
        // La prossima riga inizia da (bytePos base + i + 1) ma dobbiamo sottrarre eventuale leftover shift
        const absNext = bytePos + i + 1 - (leftover ? leftover.length : 0);
        // push in buf
        if (count >= buf.length) {
          buf = growBuffer(buf);
        }
        if (use64) {
          (buf as BigUint64Array)[count++] = BigInt(absNext);
        } else {
          (buf as Uint32Array)[count++] = absNext >>> 0;
        }
      }
    }

    // Se l'ultimo byte non è newline, manteniamo un piccolo leftover di coda per sicurezza
    // Qui basta tenere al massimo i byte dell'ultimo "segmento" non terminato.
    // Per ricostruire le righe useremo offsets, quindi il leftover serve solo alla detection del prossimo offset.
    if (data.length && data[data.length - 1] !== 10) {
      // tieni una coda corta per limitare la memoria (max 1024)
      const keep = Math.min(1024, data.length);
      leftover = data.slice(data.length - keep);
    } else {
      leftover = null;
    }

    bytePos = end;
  }

  // offsets contiene inizio di ogni riga; ultima linea potrebbe non terminare con \n, quindi ok.
  const totalLines = count; // count è il numero di inizio-riga registrati
  const offsets = buf.subarray(0, totalLines) as typeof buf;

  // Funzione per ricostruire il testo di una finestra di righe [from, to] (1-based)
  async function readLines(fromLine: number, toLine: number): Promise<string[]> {
    const from = Math.max(1, Math.min(totalLines, fromLine));
    const to = Math.max(from, Math.min(totalLines, toLine));
    if (to < from) return [];

    // Calcola range byte totale da leggere per minimizzare I/O
    const startByte = getOffset(offsets, use64, from - 1); // inizio riga 'from'
    const endByte = to < totalLines ? getOffset(offsets, use64, to) : fileSize; // inizio riga successiva o EOF
    const slice = await file.slice(Number(startByte), Number(endByte)).arrayBuffer();
    const raw = new Uint8Array(slice);

    // Split manuale usando gli offset relativi
    // Per ogni riga i, i-startIndex -> calcolo [bStart, bEnd)
    const out: string[] = [];
    for (let i = from; i <= to; i++) {
      const bStart = Number(getOffset(offsets, use64, i - 1) - startByte);
      const bEnd =
        i < totalLines ? Number(getOffset(offsets, use64, i) - startByte) : raw.length;

      // Rimuovi CR/LF finali
      let s = raw.subarray(bStart, bEnd);
      if (s.length && s[s.length - 1] === 10) s = s.subarray(0, s.length - 1);
      if (s.length && s[s.length - 1] === 13) s = s.subarray(0, s.length - 1);

      out.push(TEXT_DECODER.decode(s));
    }
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
  const bigger = buf instanceof BigUint64Array ? new BigUint64Array(Math.floor(buf.length * 1.6) + 1024) : new Uint32Array(Math.floor(buf.length * 1.6) + 1024);
  bigger.set(buf, 0);
  return bigger;
}

function getOffset(arr: Uint32Array | BigUint64Array, use64: boolean, idx: number): bigint {
  return use64 ? (arr as BigUint64Array)[idx] : BigInt((arr as Uint32Array)[idx]);
}