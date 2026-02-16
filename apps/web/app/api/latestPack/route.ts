import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Returns the current offline pack version (from manifest written by buildPack script).
 * Used by sync.ts to decide whether to download a new pack.
 */
export async function GET() {
  try {
    const path = join(process.cwd(), "public", "packs", "manifest.json");
    if (!existsSync(path)) {
      return NextResponse.json({ version: null }, { status: 200 });
    }
    const data = JSON.parse(readFileSync(path, "utf8")) as { version?: string };
    return NextResponse.json({ version: data.version ?? null, url: "/packs/pharmacydeck.db" });
  } catch {
    return NextResponse.json({ version: null }, { status: 200 });
  }
}
