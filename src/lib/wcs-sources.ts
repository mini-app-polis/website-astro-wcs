/** WCS wiki source list row (GET /v1/wcs/wiki/sources). */
export type WcsSourceItem = {
  id: string;
  transcript_id: string;
  title: string | null;
  session_date: string | null;
  session_type: string;
  instructors_raw: string[];
  students_raw: string[];
  organization: string;
  visibility: string;
  is_default_visible: boolean;
  created_at: string;
};

export type WcsSourceAttributionItem = {
  id: string;
  attribution_kind: string;
  prose: string;
  raw_term: string;
  position: number;
  drill_goal: string | null;
  drill_steps: string[] | null;
  mistake_text: string | null;
  correction_text: string | null;
  origin: string;
};

export type WcsEntityDefinitionItem = {
  id: string;
  term: string;
  definition: string;
  position: number;
  origin: string;
};

export type WcsEntityRelationItem = {
  id: string;
  relation_kind: string;
  prose: string;
  origin: string;
};

export type WcsDrillPurposeItem = {
  id: string;
  skill_name: string;
  skill_slug: string;
  prose: string;
  focus_context: string;
  origin: string;
};

export type WcsTechniqueRequirementItem = {
  id: string;
  skill_name: string;
  skill_slug: string;
  prose: string;
  origin: string;
};

export type WcsSourceReferenceItem = {
  id: string;
  referenced_name: string;
  context: string;
  ref_type: string;
  origin: string;
};

/** Full source view (GET /v1/wcs/wiki/sources/{id}). */
export type WcsSourceViewItem = {
  source: WcsSourceItem;
  attributions: WcsSourceAttributionItem[];
  definitions: WcsEntityDefinitionItem[];
  relations: WcsEntityRelationItem[];
  drill_purposes: WcsDrillPurposeItem[];
  technique_requirements: WcsTechniqueRequirementItem[];
  references: WcsSourceReferenceItem[];
};
