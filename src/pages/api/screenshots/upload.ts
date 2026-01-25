import type { APIRoute } from "astro";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const POST: APIRoute = async ({ request }) => {
  try {
    const bucketName = import.meta.env.R2_BUCKET;
    const accountId = import.meta.env.CF_ACCOUNT_ID;
    const accessKey = import.meta.env.R2_ACCESS_KEY_ID;
    const secretKey = import.meta.env.R2_SECRET_ACCESS_KEY;

    if (!bucketName || !accountId || !accessKey || !secretKey) {
      console.error("Missing R2 environment variables");
      return new Response("Server misconfigured", { status: 500 });
    }

    // ---- PARSE FORM ----
    const formData = await request.formData();
    const file = formData.get("screenshot");

    if (!(file instanceof File)) {
      return new Response("No file uploaded", { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return new Response("Invalid file type", { status: 400 });
    }

    // Optional metadata
    const world = String(formData.get("world") ?? "unknown");
    const season = String(formData.get("season") ?? "");
    const author = String(formData.get("author") ?? "");

    // ---- SAFE OBJECT KEY ----
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, "_");

    const objectKey =
      `Screenshots - Need Approval/${world}/` +
      (season ? `season-${season}/` : "") +
      `${timestamp}-${safeName}`;

// ---- R2 UPLOAD (AWS SDK v3 – SigV4) ----

// Convert File → ArrayBuffer
const buffer = await file.arrayBuffer();

// Create R2 client
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretKey
  }
});

// Upload to R2
await s3.send(
  new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    Body: buffer,
    ContentType: file.type
  })
);


    // ---- REDIRECT BACK WITH SUCCESS ----
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/gallery/upload?success=1"
      }
    });
  } catch (err) {
    console.error("Upload error:", err);
    return new Response("Upload failed", { status: 500 });
  }
};
