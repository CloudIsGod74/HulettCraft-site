export const MAX_ICON_BYTES = 64 * 1024;
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Bound reads even when Content-Length is absent or incorrect.
export async function boundedBytes(
  response: Response,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    Number(response.headers.get("Content-Length")) > limit ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new Error("Missing or oversized response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Oversized response");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function parseServerIcon(
  value: unknown,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (
    typeof value !== "string" ||
    value.length > MAX_ICON_BYTES * 1.4 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return null;
  try {
    const encoded = value.slice("data:image/png;base64,".length);
    const binary = atob(encoded);
    if (btoa(binary) !== encoded) return null;
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return await validateServerPng(bytes);
  } catch {
    return null;
  }
}

export function serverIconDataUri(bytes: Uint8Array): string {
  return (
    "data:image/png;base64," +
    btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
  );
}

export async function validateServerPng(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    if (
      bytes.length > MAX_ICON_BYTES ||
      !SIGNATURE.every((n, i) => bytes[i] === n)
    )
      return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8,
      depth = 0,
      color = 0,
      interlace = 0;
    let header = false,
      ended = false,
      palette = false,
      dataEnded = false;
    const compressed: Uint8Array[] = [];
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const end = offset + length + 12;
      if (end > bytes.length) return null;
      const kind = String.fromCharCode(
        ...bytes.subarray(offset + 4, offset + 8),
      );
      if (
        !/^[A-Za-z]{4}$/.test(kind) ||
        crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)
      )
        return null;
      if (!header && kind !== "IHDR") return null;
      if (kind === "IHDR") {
        if (
          header ||
          length !== 13 ||
          view.getUint32(offset + 8) !== 64 ||
          view.getUint32(offset + 12) !== 64
        )
          return null;
        depth = bytes[offset + 16];
        color = bytes[offset + 17];
        interlace = bytes[offset + 20];
        const depths: Record<number, number[]> = {
          0: [1, 2, 4, 8, 16],
          2: [8, 16],
          3: [1, 2, 4, 8],
          4: [8, 16],
          6: [8, 16],
        };
        if (
          !depths[color]?.includes(depth) ||
          bytes[offset + 18] !== 0 ||
          bytes[offset + 19] !== 0 ||
          interlace > 1
        )
          return null;
        header = true;
      } else if (kind === "PLTE") {
        if (
          palette ||
          compressed.length ||
          !length ||
          length % 3 ||
          length > 768 ||
          color === 0 ||
          color === 4 ||
          (color === 3 && length / 3 > 2 ** depth)
        )
          return null;
        palette = true;
      } else if (kind === "IDAT") {
        if (dataEnded || (color === 3 && !palette)) return null;
        compressed.push(bytes.subarray(offset + 8, end - 4));
      } else if (kind === "IEND") {
        if (length || !compressed.length || end !== bytes.length) return null;
        ended = true;
        break;
      } else {
        // Unknown critical chunks cannot safely be decoded.
        if (kind[0] === kind[0].toUpperCase()) return null;
        if (compressed.length) dataEnded = true;
      }
      offset = end;
    }
    if (!ended) return null;
    const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    const passes = interlace
      ? [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ]
      : [[0, 0, 1, 1]];
    const rows: number[] = [];
    for (const [x, y, dx, dy] of passes) {
      const width = Math.ceil((64 - x) / dx),
        height = Math.ceil((64 - y) / dy);
      for (let row = 0; row < height; row++)
        rows.push(Math.ceil((width * channels[color] * depth) / 8));
    }
    const expected = rows.reduce((sum, row) => sum + row + 1, 0);
    const packed = new Uint8Array(
      compressed.reduce((sum, part) => sum + part.length, 0),
    );
    let position = 0;
    for (const part of compressed) {
      packed.set(part, position);
      position += part.length;
    }
    const stream = new Blob([packed])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    const decoded = await boundedBytes(new Response(stream), expected);
    if (decoded.length !== expected) return null;
    position = 0;
    for (const row of rows) {
      if (decoded[position] > 4) return null;
      position += row + 1;
    }
    return bytes;
  } catch {
    return null;
  }
}
