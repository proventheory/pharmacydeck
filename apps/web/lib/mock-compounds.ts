import type {
  CompoundCardPresentation,
  CompoundEditorialPresentation,
  CompoundRegulatoryPresentation,
  CompoundStudyPresentation,
} from "@/lib/data";

/**
 * Mock compound/card data for skeleton launch. Matches compound + card model (Card Schema v1 + regulatory/evidence).
 */
export interface MockCompound {
  rxcui: string;
  canonical_name: string;
  description: string | null;
  card: CompoundCardPresentation;
  regulatory?: CompoundRegulatoryPresentation | null;
  studies?: CompoundStudyPresentation[];
  editorial?: CompoundEditorialPresentation[];
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
      slug: "semaglutide",
      primary_class: "GLP-1 receptor agonist",
      molecule_type: "peptide",
      pharmacokinetics: { half_life_hours: 168, bioavailability_percent: 89, metabolism: "proteolytic degradation", blood_brain_barrier: "minimal" },
      pharmacodynamics: null,
      clinical_profile: { approved_indications: ["type 2 diabetes", "chronic weight management"], contraindications: ["MEN2", "MTC history"] },
      adverse_effect_frequency: { nausea: "common", vomiting: "common", pancreatitis: "rare" },
      chemistry_profile: { molecular_weight: 4113.6, formula: "C187H291N45O59" },
      deck_stats: { rarity_score: 82, metabolic_score: 95, adoption_score: 90, trend_score: 97 },
      deck_tags: ["metabolic", "endocrine"],
      availability_profile: null,
      regulatory_summary: "FDA approved. Application NDA208387. Boxed warning: Yes.",
      evidence_summary: "Supported by 42 clinical studies.",
      study_count: 42,
      guideline_count: 2,
    },
    regulatory: {
      approval_date: "2017-12-05",
      approval_type: "NDA",
      approval_status: "approved",
      fda_application_number: "NDA208387",
      fda_label_url: null,
      boxed_warning: true,
      rems_required: false,
      controlled_substance_schedule: null,
    },
    studies: [
      {
        id: "mock-1",
        pubmed_id: "33612345",
        title: "Semaglutide 2.4 mg once weekly for weight management in adults with overweight or obesity: a meta-analysis.",
        journal: "Lancet Diabetes Endocrinol",
        publication_date: "2021-03-15",
        study_type: "meta_analysis",
        summary: "Meta-analysis showed significant weight reduction vs placebo.",
        pubmed_url: "https://pubmed.ncbi.nlm.nih.gov/33612345/",
      },
    ],
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
      slug: "tirzepatide",
      primary_class: "GIP/GLP-1 receptor agonist",
      molecule_type: "peptide",
      pharmacokinetics: null,
      pharmacodynamics: null,
      clinical_profile: null,
      adverse_effect_frequency: null,
      chemistry_profile: null,
      deck_stats: null,
      deck_tags: ["metabolic", "endocrine"],
      availability_profile: null,
      regulatory_summary: "FDA approved. Application NDA215866.",
      evidence_summary: "Supported by 28 clinical studies.",
      study_count: 28,
      guideline_count: null,
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
      slug: "metformin",
      primary_class: "Biguanide",
      molecule_type: "small_molecule",
      pharmacokinetics: null,
      pharmacodynamics: null,
      clinical_profile: null,
      adverse_effect_frequency: null,
      chemistry_profile: null,
      deck_stats: null,
      deck_tags: ["metabolic"],
      availability_profile: null,
      regulatory_summary: null,
      evidence_summary: null,
      study_count: null,
      guideline_count: null,
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
      slug: "testosterone",
      primary_class: "Androgen",
      molecule_type: "small_molecule",
      pharmacokinetics: null,
      pharmacodynamics: null,
      clinical_profile: null,
      adverse_effect_frequency: null,
      chemistry_profile: null,
      deck_stats: null,
      deck_tags: ["endocrine"],
      availability_profile: null,
      regulatory_summary: null,
      evidence_summary: null,
      study_count: null,
      guideline_count: null,
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
      slug: "enclomiphene",
      primary_class: "Selective estrogen receptor modulator (SERM)",
      molecule_type: "small_molecule",
      pharmacokinetics: null,
      pharmacodynamics: null,
      clinical_profile: null,
      adverse_effect_frequency: null,
      chemistry_profile: null,
      deck_stats: null,
      deck_tags: ["endocrine", "receptor"],
      availability_profile: null,
      regulatory_summary: null,
      evidence_summary: null,
      study_count: null,
      guideline_count: null,
    },
  },
];

export function getMockCompoundBySlug(slug: string): MockCompound | undefined {
  const normalized = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const byName = slug.toLowerCase().replace(/-/g, " ");
  return MOCK_COMPOUNDS.find(
    (c) =>
      (c.card.slug && c.card.slug.toLowerCase() === normalized) ||
      c.canonical_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") === normalized ||
      c.canonical_name.toLowerCase() === byName
  );
}

export function getMockCompoundByRxcui(rxcui: string): MockCompound | undefined {
  return MOCK_COMPOUNDS.find((c) => c.rxcui === rxcui);
}

export function getAllMockCompounds(): MockCompound[] {
  return MOCK_COMPOUNDS;
}
