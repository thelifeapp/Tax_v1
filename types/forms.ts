// types/forms.ts

// Who is answering questions in this intake session
export type AudienceMode = "client" | "lawyer";

// -----------------------------------------------------------------------------
//  FORM FIELD (matches public.form_fields exactly)
// -----------------------------------------------------------------------------

/**
 * Matches the exact columns in public.form_fields.
 * This is the full metadata record for a form field (e.g. 1041, 706, 709).
 */
export interface FormField {
  id: string;
  template_id: string;

  field_key: string;
  label: string;
  help_text: string | null;

  // Generic input type actually used by the UI (text/number/date/select/etc.)
  type: string;

  // Required?
  required: boolean;

  // Grouping for wizard section
  section: string | null;

  // Ordering within section
  order: number | null;

  // "client" | "lawyer" | "both"
  audience: string | null;

  // Raw validations blob (jsonb)
  validations: any;

  // Link to core_fields
  core_key: string | null;

  // 1041 | 706 | 709
  form_code: string | null;

  // Additional metadata columns
  data_type: string | null;
  input_type: string | null;

  // Calculated fields
  is_calculated: boolean;
  calculation: string | null;

  // “Calculation / Source Notes” column
  source_notes: string | null;

  // Conditional visibility
  visibility_condition: string | null;

  // Multi-select/select options (jsonb array)
  options: string[] | null;

  // 🔹 NEW — matches the `line_it` column in public.form_fields
  // e.g. "1", "Line A", "7a", etc.
  line_it: string | null;
}

// -----------------------------------------------------------------------------
//  SPECIALIZED TYPE FOR FORM 1041 (used in the wizard UI)
// -----------------------------------------------------------------------------

export interface FormField1041 extends FormField {
  form_code: "1041";
}

// -----------------------------------------------------------------------------
//  FORM ANSWERS (matches public.form_answers exactly)
// -----------------------------------------------------------------------------

/**
 * Matches public.form_answers exactly.
 * Every answer stored for a filing is a jsonb value keyed by field_key.
 */
export interface FormAnswer {
  filing_id: string;
  field_key: string;
  value: any; // jsonb in DB → can be string | number | boolean | array | object

  // "lawyer" | "client" — stored as answer_source enum
  source: "lawyer" | "client";

  updated_by?: string | null;
  updated_at: string; // timestamp with time zone
}
