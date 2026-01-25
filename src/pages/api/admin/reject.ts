import { requireAdmin } from "../../../lib/requireAdmin";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function POST({ request, locals }) {
  const admin = await requireAdmin(request, locals);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const { key } = await request.json();
  if (!key) return new Response("Missing key", { status: 400 });

  const {
    CF_ACCOUNT_ID,
    R2_BUCKET,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
  } = locals.runtime.env;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    })
  );

  return new Response(JSON.stringify({ ok: true }));
}
