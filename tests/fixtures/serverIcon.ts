import { deflateSync } from "node:zlib";
import { crc32 } from "../../src/lib/serverIcon";
export function chunk(kind: string, data: Uint8Array) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(kind, 4);
  result.set(data, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}
export function icon(shade = 0, width = 64) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(64, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * 64, shade);
  for (let y = 0; y < 64; y++) pixels[y * (width * 4 + 1)] = 0;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return { bytes, uri: "data:image/png;base64," + bytes.toString("base64") };
}
