// types/forms.ts

// Who is answering the questions in this session
export type AudienceMode = "client" | "lawyer";

/**
 * Shape of a single intake / form field.
 * This loosely matches the `form_fields` table + RPC output.
 */
export interface FormField {
  field_key: string;          // unique key for the field (e.g. "filer_name")
  label: string;              // plain-English question/label
  help_text?: string | null;  // optional helper text
  type: string;               // "text" | "number" | "date" | etc.
  required?: boolean | null;
  section?: string | null;    // logical grouping / section name
  order?: number | null;      // display order
  audience?: string | null;   // "client" | "lawyer" | "both"
  validations?: any;          // JSON blob from DB
  core_key?: string | null;   // maps to core_fields.core_key
  form_code?: string | null;  // "1041" | "706" | "709"
}

/**
 * Shape of a single answer row coming back from `get_form_answers`.
 */
export interface FormAnswer {
  field_key: string;
  value: any;                 // stored as jsonb in DB
  source?: "client" | "lawyer";
  updated_by?: string | null;
  updated_at?: string | null; // ISO string from DB
}
