export interface MeasureColorConfig {
  label: string;
  hex: string;
  alpha: number;
  css: string;
}

export interface ColorsConfig {
  measures: Record<string, MeasureColorConfig>;
}

export interface EvidenceRef {
  scan_file: string;
  page_index: number | null;
  bbox: number[] | null;
  ocr_confidence: number | null;
  snippet_path: string | null;
}

export interface Requirement {
  description: string;
  rule_ref: string;
  evidence: EvidenceRef;
}

export interface AppliedMeasure {
  measure_id: number;
  status: string;
  target_type: string;
  target_id: string;
  requirements: Requirement[];
  condition_expr: string;
  rule_basis: string;
  evidence: EvidenceRef[];
  notes: string[];
}

export interface TargetResult {
  target_type: string;
  target_id: string;
  applied_measures: AppliedMeasure[];
}

export interface ControlValues {
  t_control: number | string;
  y_control: number | string;
  side_thickness: number | string;
  top_thickness: number | string;
  side_yield: number | string;
  top_yield: number | string;
}

export interface DecisionResults {
  project_id: string;
  control_values: ControlValues;
  required_measures_global: number[];
  table_821_row_used: Record<string, unknown> | null;
  special_consideration: boolean;
  member_results: Record<string, TargetResult>;
  joint_results: Record<string, TargetResult>;
  manual_review_flags: string[];
  noncompliance_flags: string[];
}

export interface MemberInput {
  member_id: string;
  member_role: string;
  zone: string;
  yield_strength_nmm2: number | string;
  grade: string;
  thickness_mm_as_built: number | string;
  geometry_ref: string;
}

export interface JointInput {
  joint_id: string;
  joint_type: string;
  zone: string;
  connected_members: string[];
  weld_process: string;
  geom: { type: string; data: unknown };
  related_joint_ids: string[];
  notes: string;
}

export interface Measure3Choice {
  option: string;
  parameters: Record<string, unknown>;
}

export interface ProjectInput {
  project_meta: {
    project_id: string;
    vessel_name: string;
    date_local: string;
    timezone: string;
    allow_web_fetch: boolean;
  };
  sources: {
    scanned_rule_files: unknown[];
    diagram_files: unknown[];
    optional_shipright_files: unknown[];
  };
  members: MemberInput[];
  joints: JointInput[];
  measure3_choice: Measure3Choice;
  visualization_inputs: {
    output_dir: string;
    hatch_opening_bbox: { L: number; B: number; H: number } | string;
  };
}

export const MEASURE_COLORS: Record<number, { label: string; hex: string; alpha: number }> = {
  0: { label: 'Welding Detail Rules', hex: '#FFC107', alpha: 0.3 },
  1: { label: 'Measure 1 – Construction NDE', hex: '#FF8C00', alpha: 0.25 },
  2: { label: 'Measure 2 – Periodic In-service NDE', hex: '#1E90FF', alpha: 0.25 },
  3: { label: 'Measure 3 – Crack Arrest Measures', hex: '#DC143C', alpha: 0.25 },
  4: { label: 'Measure 4 – Upper Deck BCA Steel', hex: '#2E8B57', alpha: 0.25 },
  5: { label: 'Measure 5 – Upper Deck BCA Steel (ext.)', hex: '#8A2BE2', alpha: 0.25 },
};

export const STEPS = [
  'Material Selection',
  'Thickness Input',
  'Required Measures',
  'Measure 3 Options',
  'Results',
  'Export',
] as const;
