/**
 * Ambient types for workspace package packbuilder (resolved at runtime).
 * Prevents TS "Cannot find module 'packbuilder'" during Next type-check.
 */
declare module "packbuilder" {
  export function ingestCompound(inputName: string): Promise<{
    rxcui: string;
    canonical_name: string;
    ok: boolean;
    error?: string;
  }>;
}
