import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Detect the image type from magic bytes rather than trusting the
 * client-supplied Content-Type (which is spoofable). Returns the canonical
 * extension, or null if the bytes are not an allowed image.
 */
function sniffImage(bytes: Uint8Array): { ext: string; mime: string } | null {
  const b = bytes;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  // GIF: "GIF8"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { ext: "gif", mime: "image/gif" };
  // WEBP: "RIFF"...."WEBP"
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  return null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Throttle uploads per user (20 per 10 minutes).
  const { allowed } = await consumeRateLimit(db, `upload:${session.user.id}`, 20, 600);
  if (!allowed) {
    return NextResponse.json({ error: "Too many uploads. Please wait a bit." }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum 5MB." },
      { status: 400 }
    );
  }

  // Read once, validate by content, derive the extension ourselves.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    return NextResponse.json(
      { error: "Invalid file. Allowed: JPEG, PNG, WebP, GIF" },
      { status: 400 }
    );
  }

  const filename = `${randomUUID()}.${sniffed.ext}`;

  // Use Vercel Blob in production, local filesystem in dev
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(filename, Buffer.from(bytes), {
      access: "public",
      addRandomSuffix: false,
      contentType: sniffed.mime,
    });
    return NextResponse.json({ url: blob.url });
  }

  // Local dev fallback
  const { mkdir, writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const uploadDir = join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), bytes);
  return NextResponse.json({ url: `/uploads/${filename}` });
}
