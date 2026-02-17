import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".html": "text/html; charset=utf-8",
  ".mmd": "text/plain; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".txt": "text/plain; charset=utf-8"
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const requested = params.path.join("/");
  const repoRoot = path.resolve(process.cwd(), "../..");
  const absolute = path.resolve(repoRoot, requested);

  if (!absolute.startsWith(repoRoot)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const bytes = await fs.readFile(absolute);
    const ext = path.extname(absolute).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new Response(bytes, { headers: { "content-type": contentType } });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

