import React from "react";
import { slotDisplayName } from "../slotLabels";
import { parseLooseJsonObject, extractJournalProfileFields, normalizeMarkdownLinksInObject } from "../utils";

interface ReferenceStyle {
  style_name: string;
  in_text_citation: string;
  reference_list_order: string;
  doi_required: string;
  url_access_date_required: boolean | null;
  journal_title_style: string;
  example_reference: string;
}

interface SubmissionGuidelines {
  word_limit: number | null;
  abstract_limit: number | null;
  figure_table_limits: string | null;
  supplementary_material_policy: string;
  data_availability_policy: string;
  ethics_policy: string;
  conflict_of_interest_policy: string;
  funding_statement_policy: string;
  informed_consent_policy: string;
  ethics_review_required: "required" | "not_required" | "varies" | "unknown";
  informed_consent_required: "required" | "not_required" | "varies" | "unknown";
  coi_disclosure_required: "required" | "not_required" | "varies" | "unknown";
  // Manuscript structure / formatting
  recommended_manuscript_structure: string[];
  section_order: string;
  section_order_notes: string;
  methods_position: string;
  abstract_structure: string;
  main_text_word_limit: number | null;
  title_word_limit: number | null;
  keyword_limit: number | null;
  reference_limit: number | null;
  display_item_limit: number | null;
  figure_legend_limit: number | null;
  line_numbers_recommended: boolean | null;
  footnotes_allowed: boolean | null;
}

interface ReviewPolicy {
  novelty_requirement: string;
  methodological_requirements: string;
  statistical_reporting_expectations: string;
  reporting_guidelines: string[];
  reviewer_guidance: string;
  editorial_policy_summary: string;
  // Journal evaluation axis
  technical_soundness_oriented: string;
  importance_significance_impact_assessed: string;
  niche_scope_allowed: string;
  negative_results_allowed: string;
  replication_allowed: string;
  main_review_questions: string[];
  claims_must_be_supported_by_data: string;
  methods_analysis_interpretation_focus: string;
}

export interface PublicationCriteria {
  novelty_required: string;
  impact_required: string;
  significance_required: string;
  technical_soundness_focus: string;
  methodological_rigour_focus: string;
  statistical_rigour_focus: string;
  conclusion_supported_by_data_focus: string;
  ethical_robustness_focus: string;
  data_availability_focus: string;
  reproducibility_transparency_focus: string;
}

export interface ResearchTypeAcceptance {
  accepts_incremental_research: string;
  accepts_confirmatory_research: string;
  accepts_replication: string;
  accepts_negative_or_null_results: string;
  accepts_niche_scope: string;
  accepts_multidisciplinary_work: string;
}

export interface JournalPosition {
  multidisciplinary_mega_journal: string;
  broad_scope_journal: string;
  field_specific_high_impact_journal: string;
  clinical_high_impact_journal: string;
  society_journal: string;
  soundness_oriented_journal: string;
  selectivity_basis: string;
  evaluation_axis_summary: string;
  journal_position_summary: string;
}

export interface JournalMetrics {
  impact_factor: string;
  impact_factor_year: string;
  five_year_impact_factor: string;
  five_year_impact_factor_year: string;
  cite_score: string;
  cite_score_year: string;
  sjr: string;
  sjr_year: string;
  snip: string;
  snip_year: string;
  quartile: string;
  category_rankings: string;
  indexing: string;
  acceptance_rate_if_available: string;
}

export interface SubmissionStrategy {
  suitable_novelty_strategy: string;
  suitable_framing_strategy: string;
  unsuitable_claims: string;
  claims_to_avoid: string;
  reviewer_likely_concerns: string;
  manuscript_strengths_to_emphasize: string;
  manuscript_weaknesses_to_control: string;
}

export interface SectionAliasRule {
  alias: string;
  canonical: string;
  condition: string;
}

export interface ManuscriptStructure {
  expected_section_order: string[];
  main_text_order: string[];
  front_matter_sections: string[];
  back_matter_sections: string[];
  section_aliases: Record<string, string[]>;
  section_alias_rules: SectionAliasRule[];
  requires_abstract: boolean;
  allows_heading_variation: string;
  methods_position: string;
  allows_conclusion_section: string;
  allows_research_highlights: string;
  allows_summary_instead_of_abstract: string;
  notes: string;
}

export interface SourceEntry {
  url: string;
  title: string;
  accessed_at: string;
  retrieved_text_summary: string;
}

export interface JournalProfile {
  journal_name: string;
  journal_url: string;
  publisher: string;
  article_type: string;
  reference_style: ReferenceStyle;
  submission_guidelines: SubmissionGuidelines;
  review_policy: ReviewPolicy;
  publication_criteria: PublicationCriteria;
  research_type_acceptance: ResearchTypeAcceptance;
  journal_position: JournalPosition;
  metrics: JournalMetrics;
  submission_strategy: SubmissionStrategy;
  manuscript_structure: ManuscriptStructure;
  sources: SourceEntry[];
  notes: string;
  source: string;
  source_details: string;
  updated_at: string;
}

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  proModel: string;
  flashModel: string;
  reasoningMode: "separate_models" | "same_model_with_thinking" | "none_or_unknown";
  apiKey: string;
  apiKeyMode: "direct" | "env_var";
  apiKeyEnvName: string;
  enabled?: boolean;
}

interface JournalPanelProps {
  projectPath: string;
  journalProfile: JournalProfile;
  journalLoaded: boolean;
  journalSaved: boolean;
  journalLlmRunning: boolean;
  journalLoading: boolean;
  journalLlmPreview: JournalProfile | null;
  llmSlots: LlmSlot[];
  onUpdateField: (path: string, value: unknown) => void;
  onSave: () => void;
  onLoad: () => void;
  onLlmGenerate: (slotName: string) => void;
  onApplyJournalPreview: (profile: JournalProfile) => void;
  onClearLlmPreview: () => void;
  statusMessage: { text: string; type: "ok" | "error" | "info" } | null;
}

const ARTICLE_TYPES = [
  "Article",
  "Original Article",
  "Brief Report",
  "Review",
  "Case Report",
  "Other",
];

const IN_TEXT_CITATION_OPTIONS = [
  { value: "numeric", label: "番号式" },
  { value: "author_year", label: "著者年式" },
  { value: "other", label: "その他" },
];

const REF_LIST_ORDER_OPTIONS = [
  { value: "order_of_appearance", label: "出現順" },
  { value: "alphabetical", label: "アルファベット順" },
];

const DOI_REQUIRED_OPTIONS = [
  { value: "required", label: "必須" },
  { value: "recommended_or_required_if_available", label: "推奨（付与可能なら必須）" },
  { value: "not_required", label: "不要" },
  { value: "unknown", label: "不明" },
];

const URL_DATE_OPTIONS = [
  { value: "null", label: "不明" },
  { value: "true", label: "必要" },
  { value: "false", label: "不要" },
];

const JOURNAL_TITLE_OPTIONS = [
  { value: "abbreviated", label: "略称" },
  { value: "full", label: "フル表記" },
  { value: "abbreviated_or_full", label: "略称またはフル表記" },
  { value: "unknown", label: "不明" },
];

/* ── Validation helper ─────────────────────────────────────────────── */

interface ValidationWarning {
  field: string;
  message: string;
  severity: "error" | "warning" | "info";
}

function validateJournalProfile(profile: JournalProfile): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const pc = profile.publication_criteria;
  const rp = profile.review_policy;
  const sg = profile.submission_guidelines;
  const ms = profile.manuscript_structure;

  // 1. publication_criteria enum validation
  const ratingFields = ["novelty_required", "impact_required", "significance_required"] as const;
  const validRatings = ["high", "moderate", "low", "not_explicitly_required", "unknown"];
  for (const f of ratingFields) {
    const val = (pc as any)[f];
    if (val && !validRatings.includes(val)) {
      warnings.push({
        field: `publication_criteria.${f}`,
        message: `"${val}" は許容値ではありません。${validRatings.join(" | ")} のいずれかに修正してください。`,
        severity: "error",
      });
    }
  }

  // 2. true/false/unknown fields in publication_criteria
  const booleanFields = [
    "technical_soundness_focus", "methodological_rigour_focus", "statistical_rigour_focus",
    "conclusion_supported_by_data_focus", "ethical_robustness_focus",
    "data_availability_focus", "reproducibility_transparency_focus",
  ];
  for (const f of booleanFields) {
    const val = (pc as any)[f];
    if (val && !["true", "false", "unknown"].includes(val)) {
      warnings.push({
        field: `publication_criteria.${f}`,
        message: `"${val}" は "true" | "false" | "unknown" のいずれかにしてください。`,
        severity: "error",
      });
    }
  }

  // 3. review_policy axis fields
  const axisFields = [
    "technical_soundness_oriented", "importance_significance_impact_assessed",
    "niche_scope_allowed", "negative_results_allowed", "replication_allowed",
    "claims_must_be_supported_by_data", "methods_analysis_interpretation_focus",
  ];
  for (const f of axisFields) {
    const val = (rp as any)[f] as string;
    if (val && !["true", "false", "unknown"].includes(val)) {
      warnings.push({
        field: `review_policy.${f}`,
        message: `"${val}" は "true" | "false" | "unknown" のいずれかにしてください。`,
        severity: "error",
      });
    }
  }

  // 4. section_order / methods_position
  // Accept both arrow-separated format ("Intro → Results → ...") and long-form text descriptions
  const hasSectionOrder = sg.section_order?.trim() && sg.section_order.trim().length >= 3;
  const hasMethodsPosition = sg.methods_position?.trim() && sg.methods_position.trim().length >= 3;
  if (!hasSectionOrder && !hasMethodsPosition) {
    warnings.push({
      field: "submission_guidelines",
      message: "section_order と methods_position が両方空です。ジャーナルの推奨セクション順序を取得してください。",
      severity: "warning",
    });
  }

  // 5. Null limits check
  const limitFields = [
    "main_text_word_limit", "title_word_limit", "keyword_limit",
    "reference_limit", "display_item_limit", "figure_legend_limit",
  ];
  const nullLimits = limitFields.filter((f) => (sg as Record<string, any>)[f] === null);
  if (nullLimits.length >= 4) {
    warnings.push({
      field: "submission_guidelines",
      message: `多くの制限値が未取得です: ${nullLimits.join(", ")}。公式投稿規定から取得してください。`,
      severity: "warning",
    });
  }

  // 6. Sources check
  if (!profile.sources || profile.sources.length === 0) {
    warnings.push({
      field: "sources",
      message: "参照ソースが空です。情報源のURLを記録してください。",
      severity: "warning",
    });
  } else {
    const hasOfficial = profile.sources.some(
      (s) =>
        s.url &&
        (s.url.includes("nature.com") ||
          s.url.includes("springer.com") ||
          s.url.includes("wiley.com") ||
          s.url.includes("elsevier.com") ||
          s.url.includes("tandfonline.com") ||
          s.url.includes("oup.com"))
    );
    if (!hasOfficial) {
      warnings.push({
        field: "sources",
        message: "公式ジャーナルサイトのURLがソースに含まれていません。",
        severity: "warning",
      });
    }
  }

  // 7. All-unknown evaluation axis
  const evalFields = [
    pc.novelty_required, pc.impact_required, pc.significance_required,
    pc.technical_soundness_focus, rp.technical_soundness_oriented,
  ];
  const allUnknown = evalFields.every((v) => v === "unknown");
  if (allUnknown) {
    warnings.push({
      field: "publication_criteria / review_policy",
      message:
        "評価軸がすべて unknown です。Guide to referees を確認して少なくとも technical_soundness_oriented を特定してください。",
      severity: "warning",
    });
  }

  // 8. expected_section_order vs section_order consistency
  if (ms?.expected_section_order?.length > 0 && sg.section_order) {
    const fromMs = ms.expected_section_order.join(" → ").toLowerCase();
    const fromSg = sg.section_order.toLowerCase();
    if (fromMs !== fromSg) {
      warnings.push({
        field: "manuscript_structure / submission_guidelines",
        message: `expected_section_order と section_order が一致しません。expected_section_order: "${fromMs}" / section_order: "${fromSg}"`,
        severity: "warning",
      });
    }
  }

  // 9. section_aliases empty check
  if (ms && (!ms.section_aliases || Object.keys(ms.section_aliases).length === 0)) {
    warnings.push({
      field: "manuscript_structure.section_aliases",
      message: "section_aliases が空です。セクション見出しの別名（例: abstract ← Summary, introduction ← Background）を記録してください。",
      severity: "warning",
    });
  }

  // 10. main_text_order empty check
  if (ms && (!ms.main_text_order || ms.main_text_order.length === 0)) {
    warnings.push({
      field: "manuscript_structure.main_text_order",
      message: "main_text_order が空です。本文セクションの正規順序を指定してください。",
      severity: "warning",
    });
  }

  return warnings;
}

/* ── Status helper ─────────────────────────────────────────────────── */

function getJournalStatus(
  profile: JournalProfile,
  loaded: boolean,
  saved: boolean,
  llmPreview: JournalProfile | null,
): { text: string; chip: "ok" | "info" | "unrun" } {
  const hasData = !!profile.journal_name.trim() || loaded;
  if (!hasData && !llmPreview) return { text: "未取得", chip: "unrun" };
  if (llmPreview) return { text: "API取得済み・未保存", chip: "info" };
  if (!saved) {
    if (profile.source === "llm") return { text: "API取得済み・未保存", chip: "info" };
    if (profile.source === "external") return { text: "外部AI結果を取り込み済み・未保存", chip: "info" };
    return { text: "未保存", chip: "info" };
  }
  if (saved && loaded) return { text: "保存済み", chip: "ok" };
  return { text: "未取得", chip: "unrun" };
}

/* ── Journal acquisition modal ─────────────────────────────────────── */

function JournalAcquisitionModal({
  journalProfile,
  llmSlots,
  journalLlmRunning,
  journalLlmPreview,
  onLlmGenerate,
  onApplyToJournal,
  onClearLlmPreview,
  onClose,
}: {
  journalProfile: JournalProfile;
  llmSlots: LlmSlot[];
  journalLlmRunning: boolean;
  journalLlmPreview: JournalProfile | null;
  onLlmGenerate: (slotName: string) => void;
  onApplyToJournal: (profile: JournalProfile) => void;
  onClearLlmPreview: () => void;
  onClose: () => void;
}) {
  type ModalTab = "api" | "external";
  const [activeTab, setActiveTab] = React.useState<ModalTab>("api");

  // ── API tab state ──
  const configuredSlots = llmSlots.filter(
    (s) => s.enabled !== false && s.provider.trim() && s.baseUrl.trim() && s.proModel.trim()
  );
  const [apiSlot, setApiSlot] = React.useState(
    configuredSlots.length > 0 ? configuredSlots[0].name : ""
  );
  const selectedSlot = configuredSlots.find((s) => s.name === apiSlot);

  // ── External AI tab state ──
  const [extPrompt, setExtPrompt] = React.useState("");
  const [extPasteText, setExtPasteText] = React.useState("");
  const [extPreview, setExtPreview] = React.useState<JournalProfile | null>(null);
  const [extError, setExtError] = React.useState("");
  const [extWarnings, setExtWarnings] = React.useState<ValidationWarning[]>([]);

  const generateExternalPrompt = () => {
    const jn = journalProfile.journal_name.trim();
    const ju = journalProfile.journal_url.trim();
    const at = journalProfile.article_type;
    const defaultProfile: JournalProfile = {
      journal_name: "<OFFICIAL_JOURNAL_NAME>",
      journal_url: "<OFFICIAL_JOURNAL_WEBSITE_URL>",
      publisher: "<PUBLISHER_NAME>",
      article_type: "Article",
      reference_style: {
        style_name: "<REFERENCE_STYLE_NAME>",
        in_text_citation: "numeric",
        reference_list_order: "order_of_appearance",
        doi_required: "recommended_or_required_if_available",
        url_access_date_required: null,
        journal_title_style: "abbreviated_or_full",
        example_reference: "<EXAMPLE_REFERENCE_IN_JOURNAL_STYLE>",
      },
      submission_guidelines: {
        word_limit: null,
        abstract_limit: null,
        figure_table_limits: null,
        supplementary_material_policy: "<SUPPLEMENTARY_MATERIAL_POLICY>",
        data_availability_policy: "<DATA_AVAILABILITY_POLICY>",
        ethics_policy: "<ETHICS_POLICY>",
        conflict_of_interest_policy: "<COI_DISCLOSURE_REQUIREMENTS>",
        funding_statement_policy: "<FUNDING_STATEMENT_REQUIREMENTS>",
        informed_consent_policy: "<INFORMED_CONSENT_REQUIREMENTS>",
        ethics_review_required: "unknown",
        informed_consent_required: "unknown",
        coi_disclosure_required: "unknown",
        recommended_manuscript_structure: [],
        section_order: "<SECTION_NAMES_JOINED_BY_ARROWS>",
        section_order_notes: "<CAVEATS_ABOUT_SECTION_ORDER_FLEXIBILITY_OR_EMPTY>",
        methods_position: "<WHERE_METHODS_APPEARS>",
        abstract_structure: "<ABSTRACT_STRUCTURE>",
        main_text_word_limit: null,
        title_word_limit: null,
        keyword_limit: null,
        reference_limit: null,
        display_item_limit: null,
        figure_legend_limit: null,
        line_numbers_recommended: null,
        footnotes_allowed: null,
      },
      review_policy: {
        novelty_requirement: "<NOVELTY_REQUIREMENT_DESCRIPTION>",
        methodological_requirements: "<METHODOLOGICAL_REQUIREMENTS_DESCRIPTION>",
        statistical_reporting_expectations: "<STATISTICAL_REPORTING_EXPECTATIONS>",
        reporting_guidelines: [],
        reviewer_guidance: "<REVIEWER_GUIDANCE>",
        editorial_policy_summary: "<EDITORIAL_POLICY_SUMMARY>",
        technical_soundness_oriented: "unknown",
        importance_significance_impact_assessed: "unknown",
        niche_scope_allowed: "unknown",
        negative_results_allowed: "unknown",
        replication_allowed: "unknown",
        main_review_questions: [],
        claims_must_be_supported_by_data: "unknown",
        methods_analysis_interpretation_focus: "unknown",
      },
      publication_criteria: {
        novelty_required: "unknown",
        impact_required: "unknown",
        significance_required: "unknown",
        technical_soundness_focus: "unknown",
        methodological_rigour_focus: "unknown",
        statistical_rigour_focus: "unknown",
        conclusion_supported_by_data_focus: "unknown",
        ethical_robustness_focus: "unknown",
        data_availability_focus: "unknown",
        reproducibility_transparency_focus: "unknown",
      },
      research_type_acceptance: {
        accepts_incremental_research: "unknown",
        accepts_confirmatory_research: "unknown",
        accepts_replication: "unknown",
        accepts_negative_or_null_results: "unknown",
        accepts_niche_scope: "unknown",
        accepts_multidisciplinary_work: "unknown",
      },
      journal_position: {
        multidisciplinary_mega_journal: "unknown",
        broad_scope_journal: "unknown",
        field_specific_high_impact_journal: "unknown",
        clinical_high_impact_journal: "unknown",
        society_journal: "unknown",
        soundness_oriented_journal: "unknown",
        selectivity_basis: "<SELECTIVITY_BASIS>",
        evaluation_axis_summary: "<EVALUATION_AXIS_SUMMARY>",
        journal_position_summary: "<JOURNAL_POSITION_SUMMARY>",
      },
      metrics: {
        impact_factor: "<IMPACT_FACTOR>",
        impact_factor_year: "<IMPACT_FACTOR_YEAR>",
        five_year_impact_factor: "<FIVE_YEAR_IMPACT_FACTOR>",
        five_year_impact_factor_year: "<FIVE_YEAR_IMPACT_FACTOR_YEAR>",
        cite_score: "<CITE_SCORE>",
        cite_score_year: "<CITE_SCORE_YEAR>",
        sjr: "<SJR>",
        sjr_year: "<SJR_YEAR>",
        snip: "<SNIP>",
        snip_year: "<SNIP_YEAR>",
        quartile: "<QUARTILE>",
        category_rankings: "<CATEGORY_RANKINGS>",
        indexing: "<INDEXING_DATABASES>",
        acceptance_rate_if_available: "<ACCEPTANCE_RATE_IF_AVAILABLE>",
      },
      submission_strategy: {
        suitable_novelty_strategy: "<SUITABLE_NOVELTY_STRATEGY>",
        suitable_framing_strategy: "<SUITABLE_FRAMING_STRATEGY>",
        unsuitable_claims: "<UNSUITABLE_CLAIMS>",
        claims_to_avoid: "<CLAIMS_TO_AVOID>",
        reviewer_likely_concerns: "<REVIEWER_LIKELY_CONCERNS>",
        manuscript_strengths_to_emphasize: "<MANUSCRIPT_STRENGTHS_TO_EMPHASIZE>",
        manuscript_weaknesses_to_control: "<MANUSCRIPT_WEAKNESSES_TO_CONTROL>",
      },
      manuscript_structure: {
        expected_section_order: [],
        main_text_order: [],
        front_matter_sections: [],
        back_matter_sections: [],
        section_aliases: {},
        section_alias_rules: [],
        requires_abstract: true,
        allows_heading_variation: "unknown",
        methods_position: "<WHERE_METHODS_APPEARS>",
        allows_conclusion_section: "unknown",
        allows_research_highlights: "unknown",
        allows_summary_instead_of_abstract: "unknown",
        notes: "<MANUSCRIPT_STRUCTURE_NOTES_OR_EMPTY>",
      },
      sources: [
        {
          url: "<URL_OF_PAGE_YOU_REFERENCED>",
          title: "<DESCRIPTIVE_TITLE_OF_THE_PAGE>",
          accessed_at: "<TODAYS_DATE_IN_ISO_8601>",
          retrieved_text_summary: "<SUMMARIZE_WHAT_INFORMATION_YOU_GOT_FROM_THIS_PAGE>",
        },
      ],
      notes: "<ADDITIONAL_NOTES_OR_EMPTY>",
      source: "external",
      source_details: "<WHERE_YOU_FOUND_THIS_INFORMATION>",
      updated_at: "<TODAYS_DATE_IN_ISO_8601>",
    };
    const parts = [
      `!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`,
      `!!! ⚠ CRITICAL: REPLACE EVERY <PLACEHOLDER> IN THE JSON TEMPLATE BELOW !!!`,
      `!!!                                                                      !!!`,
      `!!! Every value wrapped in <ANGLE_BRACKETS> is a PLACEHOLDER that must   !!!`,
      `!!! be replaced with REAL data from the journal's official website.      !!!`,
      `!!!                                                                      !!!`,
      `!!! Do NOT output any <PLACEHOLDER> verbatim.                            !!!`,
      `!!! Do NOT leave any <PLACEHOLDER> in your final output.                 !!!`,
      `!!!                                                                      !!!`,
      `!!! "unknown" is the ONLY acceptable value if you genuinely cannot find  !!!`,
      `!!! the information after thorough search of the official website.       !!!`,
      `!!!                                                                      !!!`,
      `!!! null means "not applicable / no limit" — use only when the journal   !!!`,
      `!!! clearly does not impose this constraint.                             !!!`,
      `!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`,
      ``,
      `Please research the following journal and produce a structured JSON profile:`,
      ``,
      `Journal Name: ${jn || "(please fill in)"}`,
      `Journal URL: ${ju || "(please fill in)"}`,
      `Article Type: ${at}`,
      ``,
      `## CRITICAL: What to check`,
      `You MUST research these pages from the journal's official website:`,
      `1. Author instructions / submission guidelines — for manuscript structure, word limits, abstract requirements`,
      `2. Guide to referees — for what reviewers evaluate`,
      `3. Editorial process — for decision criteria`,
      `4. Aims and scope / About the journal — for journal positioning`,
      `5. Journal metrics page — for impact factor, etc.`,
      ``,
      `## Key extraction priorities`,
      `- **Section order**: What is the recommended manuscript structure?`,
      `  (e.g. Introduction → Results → Discussion → Methods for Scientific Reports)`,
      `- **Methods position**: Where does Methods appear relative to other sections?`,
      `- **Abstract**: Structured or unstructured? Word limit?`,
      `- **Limits**: main text word limit, title word limit, keyword limit, reference limit,`,
      `  display item limit, figure legend word limit`,
      `- **Evaluation axis**: Does the journal assess importance/significance/impact,`,
      `  or ONLY technical soundness and methodological rigor?`,
      `  This is CRITICAL for determining how to position the manuscript.`,
      `- **What research types are accepted?** (niche, negative results, replication, etc.)`,
      `- **Reporting guidelines**: What reporting standards are required or recommended?`,
      `- **Section heading taxonomy (manuscript_structure) — HIGH PRIORITY**:`,
      `  Identify ALL heading variations the journal accepts for each canonical section:`,
      `  - abstract: e.g. "Abstract", "Summary", "Abstract/Summary"`,
      `  - introduction: e.g. "Introduction", "Background", "Intro"`,
      `  - methods: e.g. "Methods", "Materials and Methods", "Experimental"`,
      `  - results: e.g. "Results", "Findings", "Results and Discussion"`,
      `  - discussion: e.g. "Discussion", "Discussion and Conclusions"`,
      `  - conclusion: e.g. "Conclusion", "Conclusions", "Concluding remarks"`,
      `  - references: e.g. "References", "Bibliography", "Literature cited"`,
      `  - acknowledgements: e.g. "Acknowledgements", "Acknowledgments", "謝辞"`,
      `  - competing_interests: e.g. "Competing interests", "Conflict of interest"`,
      `  - data_availability: e.g. "Data availability", "Data and code availability"`,
      `  - Declare which sections are front_matter (abstract, keywords, etc.),`,
      `    main_text, and back_matter (references, appendices, etc.).`,
      ``,
      `## Value format rules`,
      `For publication_criteria:`,
      `- novelty_required, impact_required, significance_required:`,
      `  use "high" | "moderate" | "low" | "not_explicitly_required" | "unknown"`,
      `  DO NOT use "true" or "false" for these fields.`,
      `- technical_soundness_focus, methodological_rigour_focus, etc.:`,
      `  use "true" | "false" | "unknown"`,
      ``,
      `For review_policy axis fields (technical_soundness_oriented, etc.):`,
      `use "true" | "false" | "unknown"`,
      ``,
      `For research_type_acceptance and journal_position fields:`,
      `use "true" | "false" | "unknown"`,
      ``,
      `For metrics: include the year in dedicated year fields`,
      `(impact_factor_year, five_year_impact_factor_year, etc.)`,
      ``,
      `For submission_guidelines ethics/compliance fields:`,
      `- ethics_review_required, informed_consent_required, coi_disclosure_required:`,
      `  use "required" | "not_required" | "varies" | "unknown"`,
      `  ⚠ DO NOT use "true"/"false" for these three fields — they are NOT boolean.`,
      ``,
      `## COI/ethics heading terminology (IMPORTANT for automated ethics check)`,
      `The ethics check uses the journal profile to know what headings and phrasing to expect.`,
      `You MUST capture the following details:`,
      `- In manuscript_structure.section_aliases, the "competing_interests" key MUST list`,
      `  the EXACT heading(s) the journal uses for the COI/competing interests section.`,
      `  Example for Scientific Reports: "competing_interests": ["Competing interests"]`,
      `  Example for a journal accepting both: "competing_interests": ["Competing interests", "Conflict of interest"]`,
      `- In submission_guidelines.conflict_of_interest_policy, include:`,
      `  - The expected heading name`,
      `  - The expected phrasing format (e.g., "The authors declare no competing interests.")`,
      `  - Whether a minimal statement like "None declared" is sufficient or a full sentence is required`,
      `  - Whether each author must be listed individually`,
      ``,
      `## Sources format — CRITICAL`,
      `The "sources" field MUST be an array of objects, NOT an array of URL strings.`,
      `Each object must have:`,
      `- url: the full URL of the page you used`,
      `- title: a descriptive title (e.g. "Submission guidelines | Scientific Reports")`,
      `- accessed_at: ISO datetime (e.g. "2026-05-20T12:00:00Z") — use today's date`,
      `- retrieved_text_summary: short summary of what info you got from this page`,
      `Example:`,
      `"sources": [`,
      `  {`,
      `    "url": "https://www.nature.com/srep/author-instructions/submission-guidelines",`,
      `    "title": "Submission guidelines | Scientific Reports",`,
      `    "accessed_at": "2026-05-20T12:00:00Z",`,
      `    "retrieved_text_summary": "Manuscript structure, word limits, ethics policy, COI requirements"`,
      `  }`,
      `]`,
      `DO NOT output: "sources": ["https://...", "https://..."] ← WRONG!`,
      ``,
      `## CRITICAL JSON RULES — READ CAREFULLY`,
      `- The JSON template below contains <PLACEHOLDERS> wrapped in angle brackets.`,
      `  REPLACE EVERY SINGLE ONE with real data from your research.`,
      `  A <PLACEHOLDER> left in the output = YOUR TASK IS INCOMPLETE.`,
      `- If a field is genuinely not mentioned anywhere on the journal's website,`,
      `  use "" for free-text string fields, [] for array fields,`,
      `  null for numeric limits, or "unknown" for enum fields.`,
      `- DO NOT invent or guess — every replacement must be traceable to`,
      `  information found on the journal's official website.`,
      `## CRITICAL: section_order consistency — READ BEFORE FILLING section_order`,
      `The following THREE fields must describe the SAME section order:`,
      `  1. submission_guidelines.recommended_manuscript_structure (array)`,
      `  2. submission_guidelines.section_order (string)`,
      `  3. manuscript_structure.expected_section_order (array)`,
      ``,
      `section_order FORMAT RULES (CRITICAL — violations will cause validation errors):`,
      `- section_order MUST be a single string: join the section names with " → ".`,
      `  Example: "Title page → Abstract → Keywords → Introduction → Results → Discussion → Methods → References"`,
      `- Do NOT put explanatory prose, caveats, ambiguity notes, or narrative text`,
      `  into section_order. It is a MACHINE-READABLE field for automated verification.`,
      `- If the journal says the structure is flexible or ambiguous, still provide`,
      `  the BEST normalized order in all three section-order fields, and put caveats into:`,
      `  • submission_guidelines.section_order_notes (for section-order-specific notes)`,
      `  • manuscript_structure.notes (for general structure flexibility notes)`,
      `- Use EXACTLY the same spelling and capitalization across all three fields.`,
      ``,
      `✖ INCORRECT section_order: "The journal has no strict structure, but Introduction Results Discussion Methods is suitable in many cases."`,
      `✔ CORRECT section_order:   "Introduction → Results → Discussion → Methods"`,
      `✔ CORRECT section_order_notes: "The journal states that there are no strict requirements for main body organization, although Introduction, Results, Discussion, Methods is described as suitable in many cases."`,
      ``,
      `## Section metadata rules`,
      `  - For manuscript_structure.section_aliases: map each canonical name to heading variations`,
      `    (e.g. "abstract": ["Abstract", "Summary"], "introduction": ["Introduction", "Intro", "Background"])`,
      `  - For manuscript_structure.section_alias_rules: position-dependent disambiguation rules`,
      `    (e.g. {"alias": "Conclusions", "canonical": "conclusion", "condition": "inside_or_immediately_after_discussion"})`,
      `  - For manuscript_structure.main_text_order: canonical section names in order`,
      `  - For manuscript_structure.front_matter_sections / back_matter_sections: classify each`,
      `- Include ALL sources you used in the "sources" array as objects with url/title/accessed_at/retrieved_text_summary.`,
      `- Output ONLY the filled-in JSON object. No markdown. No explanations. No code fences.`,
      ``,
      `The JSON template you MUST fill in (replace every <PLACEHOLDER>):`,
      ``,
      `\`\`\`json`,
      JSON.stringify(defaultProfile, null, 2),
      `\`\`\``,
      ``,
      `Output ONLY the completed JSON object — no markdown, no explanations, no code fences.`,
    ];
    setExtPrompt(parts.join("\n"));
  };

  // Reusable helpers for parseExternalResult

  /** Build the default JournalProfile with all fields set to empty/unknown. */
  const buildDefaultProfile = (): JournalProfile => JSON.parse(JSON.stringify({
    journal_name: "", journal_url: "", publisher: "", article_type: "Article",
    reference_style: {
      style_name: "", in_text_citation: "numeric", reference_list_order: "order_of_appearance",
      doi_required: "recommended_or_required_if_available", url_access_date_required: null,
      journal_title_style: "abbreviated_or_full", example_reference: "",
    },
    submission_guidelines: {
      word_limit: null, abstract_limit: null, figure_table_limits: null,
      supplementary_material_policy: "", data_availability_policy: "",
      ethics_policy: "", conflict_of_interest_policy: "", funding_statement_policy: "",
      informed_consent_policy: "",
      ethics_review_required: "unknown", informed_consent_required: "unknown", coi_disclosure_required: "unknown",
      recommended_manuscript_structure: [], section_order: "", section_order_notes: "", methods_position: "",
      abstract_structure: "", main_text_word_limit: null, title_word_limit: null,
      keyword_limit: null, reference_limit: null, display_item_limit: null,
      figure_legend_limit: null, line_numbers_recommended: null, footnotes_allowed: null,
    },
    review_policy: {
      novelty_requirement: "", methodological_requirements: "", statistical_reporting_expectations: "",
      reporting_guidelines: [], reviewer_guidance: "", editorial_policy_summary: "",
      technical_soundness_oriented: "unknown", importance_significance_impact_assessed: "unknown",
      niche_scope_allowed: "unknown", negative_results_allowed: "unknown", replication_allowed: "unknown",
      main_review_questions: [], claims_must_be_supported_by_data: "unknown",
      methods_analysis_interpretation_focus: "unknown",
    },
    publication_criteria: {
      novelty_required: "unknown", impact_required: "unknown", significance_required: "unknown",
      technical_soundness_focus: "unknown", methodological_rigour_focus: "unknown",
      statistical_rigour_focus: "unknown", conclusion_supported_by_data_focus: "unknown",
      ethical_robustness_focus: "unknown", data_availability_focus: "unknown",
      reproducibility_transparency_focus: "unknown",
    },
    research_type_acceptance: {
      accepts_incremental_research: "unknown", accepts_confirmatory_research: "unknown",
      accepts_replication: "unknown", accepts_negative_or_null_results: "unknown",
      accepts_niche_scope: "unknown", accepts_multidisciplinary_work: "unknown",
    },
    journal_position: {
      multidisciplinary_mega_journal: "unknown", broad_scope_journal: "unknown",
      field_specific_high_impact_journal: "unknown", clinical_high_impact_journal: "unknown",
      society_journal: "unknown", soundness_oriented_journal: "unknown",
      selectivity_basis: "", evaluation_axis_summary: "", journal_position_summary: "",
    },
    manuscript_structure: {
      expected_section_order: [], main_text_order: [], front_matter_sections: [], back_matter_sections: [],
      section_aliases: {}, section_alias_rules: [], requires_abstract: true,
      allows_heading_variation: "unknown", methods_position: "",
      allows_conclusion_section: "unknown", allows_research_highlights: "unknown",
      allows_summary_instead_of_abstract: "unknown", notes: "",
    },
    metrics: {
      impact_factor: "", impact_factor_year: "", five_year_impact_factor: "", five_year_impact_factor_year: "",
      cite_score: "", cite_score_year: "", sjr: "", sjr_year: "", snip: "", snip_year: "",
      quartile: "", category_rankings: "", indexing: "", acceptance_rate_if_available: "",
    },
    submission_strategy: {
      suitable_novelty_strategy: "", suitable_framing_strategy: "", unsuitable_claims: "",
      claims_to_avoid: "", reviewer_likely_concerns: "",
      manuscript_strengths_to_emphasize: "", manuscript_weaknesses_to_control: "",
    },
    sources: [{
      url: "https://...", title: "Page title",
      accessed_at: "2026-05-20T12:00:00Z",
      retrieved_text_summary: "What information was obtained from this page",
    }],
    notes: "", source: "external", source_details: "pasted JSON", updated_at: "",
  }));

  /** Recursively merge source into target (mutates target). */
  const deepMergeProfile = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = target[key];
      if (sv !== null && typeof sv === "object" && !Array.isArray(sv) &&
          tv !== null && typeof tv === "object" && !Array.isArray(tv)) {
        deepMergeProfile(tv as Record<string, any>, sv as Record<string, any>);
      } else if (sv !== undefined) {
        target[key] = sv;
      }
    }
  };

  /** Normalize sources array: convert string[] entries to SourceEntry objects. */
  const normalizeSources = (merged: Record<string, unknown>) => {
    if (Array.isArray(merged.sources)) {
      merged.sources = (merged.sources as unknown[]).map((s: unknown) => {
        if (typeof s === "string") {
          return { url: s, title: s, accessed_at: "", retrieved_text_summary: "" };
        }
        return s;
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  const parseExternalResult = () => {
    const text = extPasteText.trim();
    if (!text) {
      setExtError("JSONを貼り付けてください。");
      return;
    }
    // ── Fast path: try raw JSON.parse (markdown links inside strings are valid JSON) ──
    let fastValue: Record<string, unknown> | null = null;
    try {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonBlock = text.slice(firstBrace, lastBrace + 1);
        // Parse raw first — markdown links [text](url) inside JSON strings are valid
        fastValue = JSON.parse(jsonBlock);
        // Now safely normalize markdown links in the already-parsed object
        normalizeMarkdownLinksInObject(fastValue);
      }
    } catch { /* fall through to loose parser */ }

    if (fastValue) {
      // Fast path succeeded — merge with defaults and validate
      const merged = JSON.parse(JSON.stringify(buildDefaultProfile()));
      deepMergeProfile(merged, fastValue);
      normalizeSources(merged);
      const profile = merged as JournalProfile;
      // Diagnostic: log key field values before validation
      const sg = profile.submission_guidelines;
      console.log("[fast-path] journal_name:", profile.journal_name);
      console.log("[fast-path] section_order:", sg?.section_order?.substring(0, 80));
      console.log("[fast-path] methods_position:", sg?.methods_position?.substring(0, 80));
      console.log("[fast-path] main_text_word_limit:", sg?.main_text_word_limit);
      console.log("[fast-path] technical_soundness_oriented:", profile.review_policy?.technical_soundness_oriented);
      console.log("[fast-path] main_text_order:", profile.manuscript_structure?.main_text_order);
      console.log("[fast-path] section_aliases keys:", Object.keys(profile.manuscript_structure?.section_aliases || {}).length);
      console.log("[fast-path] sources count:", (profile.sources || []).length);
      console.log("[fast-path] sources[0] url:", (profile.sources || [])[0]?.url);
      // Show diagnostic in the error area too (green info, not red error)
      const diagMsg = [
        "[FAST PATH] parse OK - keys: " + Object.keys(fastValue).length,
        "journal_name: " + (profile.journal_name || "(empty)"),
        "section_order: " + (sg?.section_order ? sg.section_order.substring(0, 60) + "..." : "(empty)"),
        "methods_position: " + (sg?.methods_position ? sg.methods_position.substring(0, 60) + "..." : "(empty)"),
        "main_text_word_limit: " + (sg?.main_text_word_limit ?? "null"),
        "technical_soundness_oriented: " + profile.review_policy?.technical_soundness_oriented,
        "main_text_order: [" + (profile.manuscript_structure?.main_text_order || []).join(", ") + "]",
        "section_aliases: " + Object.keys(profile.manuscript_structure?.section_aliases || {}).length + " sections",
        "sources: " + (profile.sources || []).length + " entries",
      ].join(String.fromCharCode(10));
      if (!profile.journal_name?.trim() && (!profile.sources || profile.sources.length === 0)) {
        setExtError("JSONパース結果が空です。貼り付けたテキストにJSONが含まれているか確認してください。");
        setExtPreview(null);
        setExtWarnings([]);
        return;
      }
      setExtPreview(profile);
      setExtError(diagMsg);
      setExtWarnings(validateJournalProfile(profile));
      return;
    }

    // ── Slow path: loose JSON parser ──
    const result = parseLooseJsonObject(text);
    if (result.ok && result.value) {
      // Check if result looks like a model-only fallback (parse failed, regex got irrelevant fields)
      const valueKeys = Object.keys(result.value).filter(
        k => result.value![k] !== undefined && result.value![k] !== ""
      );
      const isModelOnlyFallback =
        result.parseError != null &&
        valueKeys.length <= 6 &&
        valueKeys.every(k =>
          ["provider", "base_url", "pro_model", "flash_model", "recommended_api_key_env", "notes"].includes(k)
        );

      if (isModelOnlyFallback) {
        // Try extracting journal profile fields instead
        const jpFields = extractJournalProfileFields(text);
        const jpKeys = Object.keys(jpFields).filter(k => jpFields[k] !== undefined && jpFields[k] !== "");
        if (jpKeys.length >= 2) {
          const merged = JSON.parse(JSON.stringify(buildDefaultProfile()));
          deepMergeProfile(merged, jpFields);
          normalizeSources(merged);
          const profile = merged as JournalProfile;
          setExtPreview(profile);
          setExtError(
            `⚠ JSONの完全なパースに失敗しました。基本情報のみ復元しました（${jpKeys.length}フィールド）。\n` +
            `元の解析エラー: ${result.parseError || "不明"}\n` +
            `入れ子フィールド（submission_guidelines, review_policy 等）は初期値のままです。\n` +
            `AI出力が有効なJSONであることを確認してください。`
          );
          setExtWarnings(validateJournalProfile(profile));
          return;
        }
        // Not enough fields — show clear error
        setExtError(
          `JSONをパースできませんでした。\n\n` +
          `解析エラー: ${result.parseError || "不明"}\n\n` +
          `以下をお試しください:\n` +
          `1. JSONブロック（{ から } まで）のみをコピーして貼り付ける\n` +
          `2. 文字化けや特殊文字が混ざっていないか確認する\n` +
          `3. JSONLint等でJSONの構文を検証する`
        );
        setExtPreview(null);
        setExtWarnings([]);
        return;
      }

      // Normal parse succeeded — deep merge with defaults
      const merged = JSON.parse(JSON.stringify(buildDefaultProfile()));
      deepMergeProfile(merged, result.value!);
      normalizeSources(merged);
      console.debug("[parseExternalResult] merged keys:", Object.keys(merged));
      console.debug("[parseExternalResult] submission_guidelines:", (merged as Record<string, any>).submission_guidelines);
      console.debug("[parseExternalResult] sources count:", (merged.sources as Array<unknown>)?.length);
      const profile = merged as JournalProfile;

      // Safety check
      if (!profile.journal_name?.trim() && (!profile.sources || profile.sources.length === 0)) {
        setExtError("JSONパース結果が空です。貼り付けたテキストにJSONが含まれているか確認してください。\n\nヒント: ChatGPTの出力にJSON以外の説明文が混ざっている場合は、JSON部分（{ から } まで）だけをコピーしてお試しください。");
        setExtPreview(null);
        setExtWarnings([]);
        return;
      }

      setExtPreview(profile);
      setExtError(result.warnings.length > 0 ? result.warnings.join("\n") : "");
      setExtWarnings(validateJournalProfile(profile));
    } else {
      setExtError(result.error || "JSONパースに失敗しました。");
    }
  };

  const clearExternal = () => {
    setExtPasteText("");
    setExtPreview(null);
    setExtError("");
    setExtWarnings([]);
  };

  // Which preview is currently relevant
  const activePreview = activeTab === "api" ? journalLlmPreview : extPreview;

  const handleApply = () => {
    if (activePreview) {
      onApplyToJournal(activePreview);
      if (activeTab === "api") {
        onClearLlmPreview();
      } else {
        clearExternal();
      }
    }
  };

  /* ── Styles ── */
  const overlayStyle: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.35)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const modalStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 8, padding: 20,
    width: 700, maxHeight: "85vh", overflowY: "auto",
    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
  };
  const tabBtnBase: React.CSSProperties = {
    padding: "6px 14px",
    border: "1px solid #ccc",
    background: "#f0f0f0",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: "4px 4px 0 0",
    marginRight: 2,
  };
  const cardStyle: React.CSSProperties = {
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    padding: 14,
    background: "#fafafa",
    marginBottom: 10,
  };
  const txtStyle: React.CSSProperties = {
    width: "100%",
    minHeight: "80px",
    fontFamily: "inherit",
    fontSize: "11px",
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>ジャーナル情報取得</h3>
          <button onClick={onClose} style={{ fontSize: 11 }}>閉じる</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", marginBottom: 0 }}>
          <button
            style={{ ...tabBtnBase, background: activeTab === "api" ? "#fff" : "#f0f0f0", borderBottom: activeTab === "api" ? "2px solid #0078d4" : "1px solid #ccc", color: activeTab === "api" ? "#0078d4" : "#555" }}
            onClick={() => setActiveTab("api")}
          >
            APIで取得
          </button>
          <button
            style={{ ...tabBtnBase, background: activeTab === "external" ? "#fff" : "#f0f0f0", borderBottom: activeTab === "external" ? "2px solid #0078d4" : "1px solid #ccc", color: activeTab === "external" ? "#0078d4" : "#555" }}
            onClick={() => setActiveTab("external")}
          >
            外部AI用プロンプトで作成
          </button>
          <div style={{ flex: 1, borderBottom: "1px solid #ccc" }} />
        </div>

        <div style={{ border: "1px solid #ccc", borderTop: "none", borderRadius: "0 0 6px 6px", padding: 14, background: "#fff" }}>
          {/* ── API tab ──────────────────────────────────────────────── */}
          {activeTab === "api" && (
            <div>
              <p style={{ fontSize: 11, color: "#888", margin: "0 0 12px 0", lineHeight: 1.5 }}>
                設定済みのPro/reasoningモデルを使って、投稿先ジャーナルの投稿規定・引用形式・査読方針を取得します。
              </p>

              {configuredSlots.length > 0 ? (
                <>
                  <div style={cardStyle}>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>使用するLLMスロット</label>
                      <select
                        value={apiSlot}
                        onChange={(e) => setApiSlot(e.target.value)}
                        disabled={journalLlmRunning}
                        style={{ width: "100%", marginTop: 2 }}
                      >
                        {configuredSlots.map((s) => (
                          <option key={s.name} value={s.name}>
                            {slotDisplayName(s.name)} (Pro: {s.proModel})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedSlot && (
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>使用モデル名</label>
                        <div style={{ fontSize: 11, marginTop: 2, padding: "3px 8px", background: "#e8f5e9", borderRadius: 3, color: "#107c10" }}>
                          {selectedSlot.proModel}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => onLlmGenerate(apiSlot)}
                      disabled={journalLlmRunning || !journalProfile.journal_name.trim()}
                      style={{ width: "100%" }}
                    >
                      {journalLlmRunning ? "生成中..." : "APIで取得"}
                    </button>
                    {journalLlmRunning && (
                      <span className="status-chip running" style={{ marginTop: 4 }}>実行中...</span>
                    )}
                    {!journalProfile.journal_name.trim() && (
                      <div className="disabled-reason" style={{ marginTop: 4 }}>先に「ジャーナル名」を入力してください</div>
                    )}
                  </div>

                  {/* LLM preview */}
                  {journalLlmPreview && (
                    <div style={cardStyle}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#107c10", marginBottom: 8 }}>
                        取得結果プレビュー
                      </div>
                      <JournalPreviewTable profile={journalLlmPreview} />
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, color: "#999", padding: 12 }}>
                  Pro/reasoningモデルが設定されているLLMスロットがありません。「設定」タブでProモデルを設定してください。
                </div>
              )}
            </div>
          )}

          {/* ── External AI tab ──────────────────────────────────────── */}
          {activeTab === "external" && (
            <div>
              <p style={{ fontSize: 11, color: "#888", margin: "0 0 12px 0", lineHeight: 1.5 }}>
                ChatGPT、GeminiなどWeb検索可能なAIにプロンプトを貼り付け、取得したJSONをここに貼り付けてください。
              </p>

              {/* Prompt generation */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <button onClick={generateExternalPrompt} style={{ flex: 1 }}>
                    外部AI用プロンプトを作成
                  </button>
                  {extPrompt && (
                    <button onClick={() => copyToClipboard(extPrompt)} style={{ fontSize: 11, height: 28 }}>
                      コピー
                    </button>
                  )}
                </div>
                {extPrompt ? (
                  <pre style={{
                    background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 4,
                    padding: 10, fontSize: 10, maxHeight: 200, overflowY: "auto",
                    whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                  }}>
                    {extPrompt}
                  </pre>
                ) : (
                  <p style={{ fontSize: 11, color: "#bbb", margin: 0 }}>
                    プロンプト作成ボタンを押すと、ここに表示されます。
                  </p>
                )}
              </div>

              {/* Paste area */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 2 }}>
                  外部AI結果を貼り付け
                </label>
                <textarea
                  style={txtStyle}
                  placeholder="ChatGPTやGeminiで取得したJSONを貼り付けてください（JSON以外の説明文が混ざっていても抽出します）..."
                  value={extPasteText}
                  onChange={(e) => setExtPasteText(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <button onClick={parseExternalResult} disabled={!extPasteText.trim()} style={{ fontSize: 11 }}>
                    パース
                  </button>
                  <button onClick={clearExternal} style={{ fontSize: 10 }}>クリア</button>
                  {extError && (
                    <span style={{ fontSize: 10, color: "#c42b1c", whiteSpace: "pre-wrap", flex: 1 }}>
                      {extError}
                    </span>
                  )}
                </div>
              </div>

              {/* External preview */}
              {extPreview && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#107c10", marginBottom: 8 }}>
                    取り込み前プレビュー
                  </div>
                  {extWarnings.length > 0 && (
                    <div style={{ marginBottom: 8, padding: 6, background: "#fff8e1", borderRadius: 4, border: "1px solid #ffe082" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#e65100", marginBottom: 4 }}>⚠ 検証警告 ({extWarnings.length}件)</div>
                      {extWarnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 10, marginBottom: 2, color: w.severity === "error" ? "#c42b1c" : "#555" }}>
                          <strong>{w.field}:</strong> {w.message}
                        </div>
                      ))}
                    </div>
                  )}
                  <JournalPreviewTable profile={extPreview} />
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 10, borderTop: "1px solid #eee" }}>
            <button
              onClick={handleApply}
              disabled={!activePreview}
              style={{ fontWeight: 600, flex: 1 }}
            >
              この内容を取り込む
            </button>
            <button onClick={onClose} style={{ fontSize: 11 }}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Preview table shared between API and external tabs ───────────── */

function JournalPreviewTable({ profile }: { profile: JournalProfile }) {
  const rows: [string, string][] = [
    ["ジャーナル名", profile.journal_name || "(空欄)"],
    ["URL", profile.journal_url || "(空欄)"],
    ["出版社", profile.publisher || "(空欄)"],
    ["論文種別", profile.article_type || "(空欄)"],
    ["情報源", profile.source || "manual"],
  ];
  if (profile.source_details) {
    rows.push(["情報源詳細", profile.source_details]);
  }
  if (profile.updated_at) {
    rows.push(["更新日時", profile.updated_at]);
  }
  // Show a few key fields from nested sections
  if (profile.reference_style?.in_text_citation) {
    rows.push(["本文中引用形式", profile.reference_style.in_text_citation]);
  }
  if (profile.reference_style?.example_reference) {
    rows.push(["書式例", profile.reference_style.example_reference.slice(0, 100) + (profile.reference_style.example_reference.length > 100 ? "..." : "")]);
  }
  if (profile.submission_guidelines?.word_limit != null) {
    rows.push(["Word制限", String(profile.submission_guidelines.word_limit)]);
  }
  if (profile.submission_guidelines?.abstract_limit != null) {
    rows.push(["Abstract制限", String(profile.submission_guidelines.abstract_limit)]);
  }
  if (profile.notes) {
    rows.push(["備考", profile.notes.slice(0, 100) + (profile.notes.length > 100 ? "..." : "")]);
  }

  return (
    <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ padding: "2px 8px 2px 0", fontWeight: 600, color: "#555", whiteSpace: "nowrap", verticalAlign: "top" }}>{label}</td>
            <td style={{ padding: "2px 0", wordBreak: "break-word" }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Main JournalPanel ─────────────────────────────────────────────── */

export default function JournalPanel({
  projectPath,
  journalProfile,
  journalLoaded,
  journalSaved,
  journalLlmRunning,
  journalLoading,
  journalLlmPreview,
  llmSlots,
  onUpdateField,
  onSave,
  onLoad,
  onLlmGenerate,
  onApplyJournalPreview,
  onClearLlmPreview,
  statusMessage,
}: JournalPanelProps) {
  const jp = journalProfile;
  const rs = jp.reference_style;
  const sg = jp.submission_guidelines;
  const rp = jp.review_policy;

  const [showModal, setShowModal] = React.useState(false);

  // Collapsible section state
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
    reference_style: false,
    submission_guidelines: false,
    review_policy: false,
    notes: false,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const status = getJournalStatus(jp, journalLoaded, journalSaved, journalLlmPreview);

  const txtStyle: React.CSSProperties = {
    width: "100%",
    minHeight: "60px",
    fontFamily: "inherit",
    fontSize: "12px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "#555",
    minWidth: "140px",
  };

  const collapsibleHeaderStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: "#333",
    cursor: "pointer",
    padding: "8px 0",
    borderBottom: "1px solid #eee",
    margin: "0 0 8px 0",
    userSelect: "none",
  };

  const statusChipColor = status.chip === "ok" ? "#107c10" : status.chip === "info" ? "#0078d4" : "#888";
  const statusBgColor = status.chip === "ok" ? "#e8f5e9" : status.chip === "info" ? "#e3f2fd" : "#f5f5f5";

  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      {/* ── 状態表示 ────────────────────────────────────────────────── */}
      <section className="panel" style={{ paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>状態:</span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            padding: "2px 10px", borderRadius: 12,
            background: statusBgColor, color: statusChipColor,
          }}>
            {status.text}
          </span>
          {jp.source && jp.source !== "manual" && (
            <span style={{ fontSize: 10, color: "#888" }}>
              情報源: {jp.source}
            </span>
          )}
          {jp.source_details && (
            <span style={{ fontSize: 10, color: "#888" }}>
              ({jp.source_details})
            </span>
          )}
          {jp.updated_at && (
            <span style={{ fontSize: 10, color: "#aaa" }}>
              最終更新: {jp.updated_at.slice(0, 16).replace("T", " ")}
            </span>
          )}
        </div>
      </section>

      {/* ── ① ジャーナル基本情報 ──────────────────────────────────── */}
      <section className="panel">
        <h2>ジャーナル基本情報</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>ジャーナル名</span>
          <input
            type="text"
            className="path-input"
            value={jp.journal_name}
            onChange={(e) => onUpdateField("journal_name", e.target.value)}
            placeholder="例: Scientific Reports"
            style={{ flex: 1 }}
          />
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>ジャーナルURL</span>
          <input
            type="text"
            className="path-input"
            value={jp.journal_url}
            onChange={(e) => onUpdateField("journal_url", e.target.value)}
            placeholder="https://www.nature.com/srep/"
            style={{ flex: 1 }}
          />
        </div>
        <div className="row">
          <span style={labelStyle}>論文種別</span>
          <select
            value={jp.article_type}
            onChange={(e) => onUpdateField("article_type", e.target.value)}
          >
            {ARTICLE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </section>

      {/* ── ② 操作ボタン ──────────────────────────────────────────── */}
      <section className="panel">
        <h2>操作</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setShowModal(true)}
            disabled={!projectPath || journalLlmRunning}
            style={{ fontWeight: 600 }}
          >
            ジャーナル情報を取得・取り込む
          </button>
          <button onClick={onSave} disabled={!projectPath || journalLoading}>
            {journalLoading ? "保存中..." : "保存"}
          </button>
          <button onClick={onLoad} disabled={!projectPath || journalLoading}>
            読み込み
          </button>
          {journalLoaded && (
            <span className="status-chip ok">読込済</span>
          )}
        </div>
        <p style={{ fontSize: 11, color: "#888", margin: "8px 0 0 0" }}>
          取得・取り込み後、内容を確認してから「保存」を押してください。保存すると journal_profile.json に書き出されます。
        </p>
      </section>

      {/* ── ③ 取得済み情報の確認（折りたたみ） ────────────────────── */}
      <section className="panel">
        <h2>取得済み情報の確認</h2>

        {/* ── 引用・文献形式 ── */}
        <div>
          <div style={collapsibleHeaderStyle} onClick={() => toggle("reference_style")}>
            {expanded.reference_style ? "▼" : "▶"} 引用・文献形式
          </div>
          {expanded.reference_style && (
            <div style={{ paddingLeft: 8 }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <span style={labelStyle}>本文中引用形式</span>
                <select
                  value={rs.in_text_citation}
                  onChange={(e) => onUpdateField("reference_style.in_text_citation", e.target.value)}
                >
                  {IN_TEXT_CITATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <span style={labelStyle}>文献リストの順番</span>
                <select
                  value={rs.reference_list_order}
                  onChange={(e) => onUpdateField("reference_style.reference_list_order", e.target.value)}
                >
                  {REF_LIST_ORDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <span style={labelStyle}>DOI表記</span>
                <select
                  value={rs.doi_required}
                  onChange={(e) => onUpdateField("reference_style.doi_required", e.target.value)}
                >
                  {DOI_REQUIRED_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <span style={labelStyle}>アクセス日</span>
                <select
                  value={rs.url_access_date_required === null ? "null" : String(rs.url_access_date_required)}
                  onChange={(e) => {
                    const v = e.target.value;
                    onUpdateField(
                      "reference_style.url_access_date_required",
                      v === "null" ? null : v === "true"
                    );
                  }}
                >
                  {URL_DATE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <span style={labelStyle}>ジャーナル名表記</span>
                <select
                  value={rs.journal_title_style}
                  onChange={(e) => onUpdateField("reference_style.journal_title_style", e.target.value)}
                >
                  {JOURNAL_TITLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="row">
                <span style={{ ...labelStyle, alignSelf: "flex-start" }}>参考文献の書式例</span>
                <textarea
                  style={txtStyle}
                  rows={3}
                  value={rs.example_reference}
                  onChange={(e) => onUpdateField("reference_style.example_reference", e.target.value)}
                  placeholder="著者名. タイトル. 雑誌名 巻, ページ (年)."
                />
              </div>
            </div>
          )}
        </div>

        {/* ── 投稿規定 ── */}
        <div>
          <div style={collapsibleHeaderStyle} onClick={() => toggle("submission_guidelines")}>
            {expanded.submission_guidelines ? "▼" : "▶"} 投稿規定
          </div>
          {expanded.submission_guidelines && (
            <div style={{ paddingLeft: 8 }}>
              <div className="row" style={{ marginBottom: 6, gap: 16 }}>
                <span style={labelStyle}>Abstract制限（語数）</span>
                <input
                  type="number"
                  className="path-input"
                  value={sg.abstract_limit ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onUpdateField("submission_guidelines.abstract_limit", v === "" ? null : Number(v));
                  }}
                  style={{ width: 120 }}
                />
                <span style={{ ...labelStyle, minWidth: "auto" }}>Word制限</span>
                <input
                  type="number"
                  className="path-input"
                  value={sg.word_limit ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onUpdateField("submission_guidelines.word_limit", v === "" ? null : Number(v));
                  }}
                  style={{ width: 120 }}
                />
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <span style={labelStyle}>図表制限</span>
                <input
                  type="text"
                  className="path-input"
                  value={sg.figure_table_limits ?? ""}
                  onChange={(e) => {
                    onUpdateField("submission_guidelines.figure_table_limits", e.target.value || null);
                  }}
                  style={{ flex: 1 }}
                />
              </div>
              {([
                ["supplementary_material_policy", "補足資料方針"],
                ["data_availability_policy", "データ利用方針"],
                ["ethics_policy", "倫理規定"],
                ["conflict_of_interest_policy", "利益相反方針"],
                ["funding_statement_policy", "資金提供記載方針"],
                ["informed_consent_policy", "IC方針"],
              ] as [string, string][]).map(([key, label]) => (
                <div className="row" key={key} style={{ marginBottom: 4 }}>
                  <span style={{ ...labelStyle, alignSelf: "flex-start" }}>{label}</span>
                  <textarea
                    style={txtStyle}
                    rows={2}
                    value={(sg as Record<string, any>)[key] as string || ""}
                    onChange={(e) => onUpdateField(`submission_guidelines.${key}`, e.target.value)}
                  />
                </div>
              ))}
              {([
                ["ethics_review_required", "倫理審査要否"],
                ["informed_consent_required", "IC要否"],
                ["coi_disclosure_required", "COI開示要否"],
              ] as [string, string][]).map(([key, label]) => (
                <div className="row" key={key} style={{ marginBottom: 4 }}>
                  <span style={labelStyle}>{label}</span>
                  <select
                    className="path-input"
                    value={(sg as Record<string, any>)[key] as string || "unknown"}
                    onChange={(e) => onUpdateField(`submission_guidelines.${key}`, e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="required">required（必須）</option>
                    <option value="not_required">not_required（不要）</option>
                    <option value="varies">varies（研究種別による）</option>
                    <option value="unknown">unknown（不明）</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 査読・掲載方針 ── */}
        <div>
          <div style={collapsibleHeaderStyle} onClick={() => toggle("review_policy")}>
            {expanded.review_policy ? "▼" : "▶"} 査読・掲載方針
          </div>
          {expanded.review_policy && (
            <div style={{ paddingLeft: 8 }}>
              {([
                ["novelty_requirement", "新規性要件"],
                ["methodological_requirements", "方法論的要件"],
                ["statistical_reporting_expectations", "統計報告基準"],
              ] as [string, string][]).map(([key, label]) => (
                <div className="row" key={key} style={{ marginBottom: 4 }}>
                  <span style={{ ...labelStyle, alignSelf: "flex-start" }}>{label}</span>
                  <textarea
                    style={txtStyle}
                    rows={2}
                    value={(rp as Record<string, any>)[key] as string}
                    onChange={(e) => onUpdateField(`review_policy.${key}`, e.target.value)}
                  />
                </div>
              ))}
              <div className="row" style={{ marginBottom: 4 }}>
                <span style={{ ...labelStyle, alignSelf: "flex-start" }}>報告ガイドライン</span>
                <textarea
                  style={txtStyle}
                  rows={3}
                  value={rp.reporting_guidelines.join("\n")}
                  onChange={(e) =>
                    onUpdateField(
                      "review_policy.reporting_guidelines",
                      e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                    )
                  }
                  placeholder="1行に1つずつ入力（例: CONSORT, STROBE, PRISMA）"
                />
              </div>
              {([
                ["reviewer_guidance", "査読者向け指針"],
                ["editorial_policy_summary", "編集方針概要"],
              ] as [string, string][]).map(([key, label]) => (
                <div className="row" key={key} style={{ marginBottom: 4 }}>
                  <span style={{ ...labelStyle, alignSelf: "flex-start" }}>{label}</span>
                  <textarea
                    style={txtStyle}
                    rows={3}
                    value={(rp as Record<string, any>)[key] as string}
                    onChange={(e) => onUpdateField(`review_policy.${key}`, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 備考 ── */}
        <div>
          <div style={collapsibleHeaderStyle} onClick={() => toggle("notes")}>
            {expanded.notes ? "▼" : "▶"} 備考
          </div>
          {expanded.notes && (
            <div style={{ paddingLeft: 8 }}>
              <div className="row" style={{ marginBottom: 4 }}>
                <span style={{ ...labelStyle, alignSelf: "flex-start" }}>備考</span>
                <textarea
                  style={txtStyle}
                  rows={4}
                  value={jp.notes}
                  onChange={(e) => onUpdateField("notes", e.target.value)}
                />
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <span style={labelStyle}>出版社</span>
                <input
                  type="text"
                  className="path-input"
                  value={jp.publisher}
                  onChange={(e) => onUpdateField("publisher", e.target.value)}
                  placeholder="Springer Nature"
                  style={{ flex: 1 }}
                />
              </div>
              <div className="row" style={{ marginBottom: 4, fontSize: 11, color: "#888" }}>
                <span style={labelStyle}>情報源</span>
                <span>{jp.source || "manual"}</span>
              </div>
              {jp.source_details && (
                <div className="row" style={{ marginBottom: 4, fontSize: 11, color: "#888" }}>
                  <span style={labelStyle}>情報源詳細</span>
                  <span>{jp.source_details}</span>
                </div>
              )}
              {jp.updated_at && (
                <div className="row" style={{ marginBottom: 4, fontSize: 11, color: "#888" }}>
                  <span style={labelStyle}>更新日時</span>
                  <span>{jp.updated_at}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Next step hint */}
      <div className="next-step">
        {!projectPath && "プロジェクトを作成してください。"}
        {projectPath && !journalLoaded && !jp.journal_name.trim() &&
          "ジャーナル名とURLを入力し、「ジャーナル情報を取得・取り込む」から情報を取得してください。"}
        {projectPath && (journalLoaded || jp.journal_name.trim()) && !journalSaved &&
          "取得した情報を確認し、「保存」を押してください。"}
        {projectPath && journalLoaded && journalSaved &&
          "ジャーナル情報を編集後、「保存」を押してください。次の工程（文献確認・査読チェック）で自動参照されます。"}
      </div>

      {/* Acquisition modal */}
      {showModal && (
        <JournalAcquisitionModal
          journalProfile={journalProfile}
          llmSlots={llmSlots}
          journalLlmRunning={journalLlmRunning}
          journalLlmPreview={journalLlmPreview}
          onLlmGenerate={onLlmGenerate}
          onApplyToJournal={(profile) => {
            onApplyJournalPreview(profile);
          }}
          onClearLlmPreview={onClearLlmPreview}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
