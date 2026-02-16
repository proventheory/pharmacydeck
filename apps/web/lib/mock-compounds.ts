/**
 * Mock compound/card data for skeleton launch. Matches compound + card model.
 */
export interface MockCompound {
  rxcui: string;
  canonical_name: string;
  description: string | null;
  card: {
    classification: string | null;
    mechanism_summary: string | null;
    uses_summary: string | null;
    safety_summary: string | null;
    source_links: string[] | null;
  };
}

export const MOCK_COMPOUNDS: MockCompound[] = [
  {
    rxcui: "199130",
    canonical_name: "Semaglutide",
    description: "GLP-1 receptor agonist used for type 2 diabetes and weight management.",
    card: {
      classification: "GLP-1 receptor agonist",
      mechanism_summary:
        "Semaglutide is a glucagon-like peptide-1 (GLP-1) receptor agonist that increases insulin secretion, decreases glucagon secretion, and slows gastric emptying.",
      uses_summary:
        "Used to improve glycemic control in adults with type 2 diabetes mellitus; also indicated for chronic weight management in adults with obesity or overweight with at least one weight-related comorbidity.",
      safety_summary:
        "Contraindicated in personal or family history of MTC or in patients with MEN 2. Risk of thyroid C-cell tumors. Pancreatitis, diabetic retinopathy, and acute kidney injury have been reported.",
      source_links: ["https://dailymed.nlm.nih.gov/", "https://open.fda.gov/"],
    },
  },
  {
    rxcui: "261551",
    canonical_name: "Tirzepatide",
    description: "Dual GIP and GLP-1 receptor agonist for type 2 diabetes and weight management.",
    card: {
      classification: "GIP/GLP-1 receptor agonist",
      mechanism_summary:
        "Tirzepatide is a dual glucose-dependent insulinotropic polypeptide (GIP) and GLP-1 receptor agonist that improves glycemic control and supports weight loss.",
      uses_summary:
        "Indicated as an adjunct to diet and exercise to improve glycemic control in adults with type 2 diabetes; and for chronic weight management in adults with obesity or overweight with weight-related comorbidities.",
      safety_summary:
        "Contraindicated in personal or family history of MTC or MEN 2. Risk of thyroid C-cell tumors. Pancreatitis, gallbladder disease, and acute kidney injury have been reported.",
      source_links: ["https://dailymed.nlm.nih.gov/", "https://open.fda.gov/"],
    },
  },
  {
    rxcui: "861007",
    canonical_name: "Metformin",
    description: "First-line oral antidiabetic; decreases hepatic glucose production and improves insulin sensitivity.",
    card: {
      classification: "Biguanide",
      mechanism_summary:
        "Metformin decreases hepatic glucose production, decreases intestinal absorption of glucose, and improves insulin sensitivity in peripheral tissues.",
      uses_summary:
        "First-line therapy for type 2 diabetes mellitus; also used off-label for prediabetes and PCOS.",
      safety_summary:
        "Lactic acidosis is a rare but serious risk, especially with renal impairment. Avoid in severe renal disease. GI upset is common; usually transient.",
      source_links: ["https://dailymed.nlm.nih.gov/", "https://pubchem.ncbi.nlm.nih.gov/"],
    },
  },
  {
    rxcui: "5640",
    canonical_name: "Testosterone",
    description: "Primary male sex hormone; used for replacement therapy and certain conditions.",
    card: {
      classification: "Androgen",
      mechanism_summary:
        "Testosterone is the primary endogenous androgen. It promotes nitrogen retention, protein anabolism, and growth of androgen-dependent tissues.",
      uses_summary:
        "Replacement therapy in males for conditions associated with deficiency or absence of endogenous testosterone (e.g., hypogonadism).",
      safety_summary:
        "Contraindicated in men with breast or prostate cancer. May cause erythrocytosis, edema, and sleep apnea. Monitor hematocrit and PSA.",
      source_links: ["https://dailymed.nlm.nih.gov/", "https://open.fda.gov/"],
    },
  },
  {
    rxcui: "313782",
    canonical_name: "Enclomiphene",
    description: "Enantiomer of clomiphene; used to increase endogenous testosterone in men.",
    card: {
      classification: "Selective estrogen receptor modulator (SERM)",
      mechanism_summary:
        "Enclomiphene is the zu-enantiomer of clomiphene. It acts as an estrogen receptor antagonist in the hypothalamus, increasing gonadotropin release and thus testosterone production.",
      uses_summary:
        "Used in men for the treatment of hypogonadism to increase endogenous testosterone while maintaining or improving sperm production compared to exogenous testosterone.",
      safety_summary:
        "Visual disturbances, ovarian enlargement, and mood changes have been reported with clomiphene; use under physician supervision.",
      source_links: ["https://dailymed.nlm.nih.gov/", "https://pubchem.ncbi.nlm.nih.gov/"],
    },
  },
];

export function getMockCompoundBySlug(slug: string): MockCompound | undefined {
  const normalized = slug.toLowerCase().replace(/-/g, " ");
  return MOCK_COMPOUNDS.find(
    (c) =>
      c.canonical_name.toLowerCase().replace(/\s+/g, "-") === slug ||
      c.canonical_name.toLowerCase() === normalized
  );
}

export function getMockCompoundByRxcui(rxcui: string): MockCompound | undefined {
  return MOCK_COMPOUNDS.find((c) => c.rxcui === rxcui);
}

export function getAllMockCompounds(): MockCompound[] {
  return MOCK_COMPOUNDS;
}
