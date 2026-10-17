export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BULK_BYTES = 25 * 1024 * 1024;
export async function limitedForm(
  request: Request,
  limit: number,
): Promise<FormData> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw new Response("Expected multipart form data", { status: 415 });
  if (Number(request.headers.get("content-length")) > limit)
    throw new Response("Upload too large", { status: 413 });
  if (!request.body) throw new Response("Missing upload", { status: 400 });
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Response("Upload too large", { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new Response("Invalid upload form", { status: 400 });
  }
}
export async function validateImage(file: File) {
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Response("Images must be between 1 byte and 10 MiB", {
      status: 413,
    });
  const bytes = new Uint8Array(await file.arrayBuffer()),
    view = new DataView(bytes.buffer);
  const text = (start: number, end: number) =>
    new TextDecoder("ascii").decode(bytes.subarray(start, end));
  let type = "",
    extension = "",
    width = 0,
    height = 0;
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    view.getUint32(8) === 13 &&
    text(12, 16) === "IHDR" &&
    text(bytes.length - 8, bytes.length - 4) === "IEND"
  ) {
    type = "image/png";
    extension = "png";
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (
    bytes.length >= 14 &&
    ["GIF87a", "GIF89a"].includes(text(0, 6)) &&
    bytes.at(-1) === 0x3b
  ) {
    type = "image/gif";
    extension = "gif";
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else if (
    bytes.length >= 30 &&
    text(0, 4) === "RIFF" &&
    text(8, 12) === "WEBP" &&
    view.getUint32(4, true) + 8 === bytes.length
  ) {
    const chunk = text(12, 16);
    if (chunk === "VP8X") {
      width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    } else if (
      chunk === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
      width = 1 + (view.getUint32(21, true) & 0x3fff);
      height = 1 + ((view.getUint32(21, true) >> 14) & 0x3fff);
    }
    type = "image/webp";
    extension = "webp";
  } else if (
    bytes.length >= 10 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  ) {
    for (let pos = 2; pos + 8 < bytes.length; ) {
      if (bytes[pos++] !== 255) break;
      while (bytes[pos] === 255) pos++;
      const marker = bytes[pos++];
      if (marker === 0xda || marker === 0xd9) break;
      if (pos + 2 > bytes.length) break;
      const size = view.getUint16(pos);
      if (size < 2 || pos + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = view.getUint16(pos + 3);
        width = view.getUint16(pos + 5);
        break;
      }
      pos += size;
    }
    type = "image/jpeg";
    extension = "jpg";
  }
  if (
    !type ||
    !width ||
    !height ||
    width > 16384 ||
    height > 16384 ||
    width * height > 40_000_000
  )
    throw new Response(
      "Use a valid PNG, JPEG, GIF, or WebP image (maximum 40 megapixels). SVG is not supported.",
      { status: 415 },
    );
  return { bytes, type, extension };
}
export function safeFilename(name: string) {
  return (
    name
      .replace(/\.[^.]*$/, "")
      .replace(/[^a-z0-9_-]/gi, "_")
      .slice(0, 100) || "screenshot"
  );
}
