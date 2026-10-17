export const PENDING_PREFIX = "Screenshots - Need Approval/";

/** Pending uploads are single files, never paths or encoded paths. */
export function isPendingKey(key: unknown): key is string {
  if (typeof key !== "string" || !key.startsWith(PENDING_PREFIX)) return false;
  const filename = key.slice(PENDING_PREFIX.length);
  return filename.length > 0 && filename.length <= 512 &&
    filename !== "." && filename !== ".." &&
    !/[\\/\x00-\x1f\x7f%?#]/.test(filename);
}
