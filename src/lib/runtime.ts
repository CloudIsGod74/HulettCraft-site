import type {
  R2Bucket,
  KVNamespace,
} from "@cloudflare/workers-types/experimental";
export interface Env {
  HULETTCRAFT_BUCKET?: R2Bucket;
  SESSION?: KVNamespace;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ADMIN_SESSION_SECRET?: string;
  UPLOAD_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
export function getBucket(locals: App.Locals): R2Bucket {
  const bucket = locals.runtime?.env?.HULETTCRAFT_BUCKET;
  if (!bucket)
    throw new Response("Gallery storage unavailable", { status: 503 });
  return bucket;
}
