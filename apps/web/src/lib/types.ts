/**
 * TypeScript types mirroring the Python Pydantic models.
 */

export type StrOrUnspec = string | '미지정';
export type NumOrUnspec = number | '미지정';

export interface ProjectMeta {
  project_id: string;
  vessel_name: StrOrUnspec;
  date_local: string;
  timezone: string;
  allow_web_fetch: boolean;
}

export interface MemberInput {
  member_id: string;
  member_role: string;
  zone: string;
  yield_strength_nmm2: NumOrUnspec;
  grade: StrOrUnspec;
  thickness_mm_as_built: NumOrUnspec;
  geometry_ref: StrOrUnspec;
}

export interface JointInput {
  joint_id: string;
  joint_type: string;
  zone: string;
  connected_members: string[];
  weld_process: string;
  geom: { type: string; data: any };
  related_joint_ids: string[];
  notes: StrOrUnspec;
}

export interface Measure3Choice {
  option: string;
  parameters: {
    block_shift_offset_mm: NumOrUnspec;
    hole_diameter_mm: NumOrUnspec;
    insert_type: StrOrUnspec;
    enhanced_nde_method: StrOrUnspec;
    enhanced_nde_acceptance_criteria_ref: StrOrUnspec;
  };
}

export interface HatchOpeningBbox {
  L: NumOrUnspec;
  B: NumOrUnspec;
  H: NumOrUnspec;
}

export interface ProjectInput {
  project_meta: ProjectMeta;
  members: MemberInput[];
  joints: JointInput[];
  measure3_choice: Measure3Choice;
  visualization_inputs: {
    output_dir: string;
    hatch_opening_bbox: HatchOpeningBbox | '미지정';
  };
}

export interface EvidenceRecord {
  scan_file: StrOrUnspec;
  page_index: number | '미지정';
  bbox: number[] | null;
  ocr_confidence: number | null;
  snippet_path: StrOrUnspec;
  raw_text: StrOrUnspec;
}

export interface AppliedMeasure {
  measure_id: number;
  status: string;
  target_id: string;
  target_type: 'member' | 'joint';
  requirements: string[];
  condition_expr: StrOrUnspec;
  rule_ref: StrOrUnspec;
  evidence: EvidenceRecord[];
  notes: string[];
}

export interface ManualReviewFlag {
  flag_id: string;
  target_id: StrOrUnspec;
  description: string;
  severity: string;
}

export interface ControlValues {
  t_control_mm: NumOrUnspec;
  y_control_nmm2: NumOrUnspec;
  required_measures_global: number[];
  table_821_row_used: StrOrUnspec;
  manual_review_flags: ManualReviewFlag[];
}

export interface DecisionResults {
  project_id: string;
  control_values: ControlValues;
  applied_measures: AppliedMeasure[];
  manual_review_flags: ManualReviewFlag[];
  summary: Record<string, any>;
}

export interface MeasureColorConfig {
  label: string;
  hex: string;
  alpha: number;
  stroke: string;
}

export interface ColorsConfig {
  measures: Record<string, MeasureColorConfig>;
  [key: string]: any;
}

export const MEASURE_LABELS: Record<number, string> = {
  0: 'Welding Detail Rule',
  1: 'Measure 1 – Construction NDE',
  2: 'Measure 2 – Periodic In-service NDE',
  3: 'Measure 3 – Crack Arrest Measures',
  4: 'Measure 4 – Upper Deck BCA Steel',
  5: 'Measure 5 – Upper Deck BCA Steel (ext)',
};

export const DEFAULT_COLORS: Record<number, string> = {
  0: '#888888',
  1: '#FF8C00',
  2: '#1E90FF',
  3: '#DC143C',
  4: '#2E8B57',
  5: '#8A2BE2',
};
