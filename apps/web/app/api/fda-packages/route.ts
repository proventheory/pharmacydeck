import { NextRequest } from "next/server";
import { fetchFDAPackages } from "@/lib/sources/fetchFDAPackages";

export const dynamic = "force-dynamic";

/**
 * GET /api/fda-packages?application_number=NDA208387
 *    or ?rxcui=1234
 *    or ?substance_name=Semaglutide
 * Returns FDA approval package document links.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const application_number = searchParams.get("application_number")?.trim() || undefined;
  const rxcui = searchParams.get("rxcui")?.trim() || undefined;
  const substance_name = searchParams.get("substance_name")?.trim() || undefined;

  if (!application_number && !rxcui && !substance_name) {
    return Response.json(
      { error: "Provide application_number, rxcui, or substance_name" },
      { status: 400 }
    );
  }

  const result = await fetchFDAPackages({
    application_number: application_number ?? null,
    rxcui: rxcui ?? null,
    substance_name: substance_name ?? null,
  });

  return Response.json(result);
}
