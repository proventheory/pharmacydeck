/**
 * DailyMed / openFDA labeling. Stub implementation; expand with real API calls.
 * DailyMed: https://dailymed.nlm.nih.gov/dailymed/
 * openFDA: https://open.fda.gov/apis/drug/label/
 */

export interface LabelSnippetInput {
  section: string;
  text: string;
  source: string;
}

export async function fetchLabelSnippetsForRxcui(
  _rxcui: string,
  _canonicalName: string
): Promise<LabelSnippetInput[]> {
  // TODO: Resolve NDC or set ID from RxNorm, then call DailyMed or openFDA.
  // For skeleton, return empty; ingestion will still create compound/synonym/card.
  return [];
}
