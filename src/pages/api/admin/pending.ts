import { requireAdmin } from "../../../lib/requireAdmin";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET({ request, locals }: any) {
  const admin = await requireAdmin(request, locals);
  if (!admin) return new Response("Unauthorized", { status: 401 });

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

  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: "Screenshots - Need Approval/",
    })
  );

  const items = await Promise.all(
    (res.Contents ?? []).map(async (obj) => {
      const key = obj.Key!;
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
        }),
        { expiresIn: 60 * 5 } // 5 min preview
      );

      return {
        key,
        url,
        uploadedAt: obj.LastModified?.toISOString(),
      };
    })
  );

  return Response.json(items);
}
