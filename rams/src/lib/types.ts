// Shared domain types. The RAMS body lives in a JSONB column, so `RamsContent`
// is the contract between the builder, the report renderer and the database.

export type Sector = 'residential' | 'commercial';

export type TechnologyId =
  | 'solar_pv'
  | 'battery_storage'
  | 'ashp'
  | 'led_lighting'
  | 'small_wind';

export type RamsStatus = 'draft' | 'in_review' | 'approved' | 'issued' | 'archived';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'complete' | 'cancelled';

export type UserRole = 'member' | 'manager' | 'admin';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  job_title: string | null;
  phone: string | null;
  role: UserRole;
  status: ApprovalStatus;
  signature_url: string | null;
  created_at: string;
};

export type CompanySettings = {
  id: number;
  name: string;
  trading_name: string | null;
  registration_number: string | null;
  vat_number: string | null;
  address: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  hs_policy_statement: string | null;
  competent_person: string | null;
  insurer: string | null;
  policy_number: string | null;
  policy_expiry: string | null;
  emergency_contact: string | null;
  updated_at: string;
};

export type Certification = {
  id: string;
  owner_type: 'company' | 'user';
  profile_id: string | null;
  holder_name: string | null;
  title: string;
  category: string | null;
  issuing_body: string | null;
  reference: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  reference: string;
  name: string;
  status: ProjectStatus;
  sector: Sector;
  technologies: TechnologyId[];
  client_name: string | null;
  client_contact: string | null;
  client_phone: string | null;
  client_email: string | null;
  site_address: string | null;
  site_postcode: string | null;
  site_contact: string | null;
  site_contact_phone: string | null;
  what3words: string | null;
  /** Site coordinates, from the address lookup or the postcode centroid. */
  site_lat: number | null;
  site_lng: number | null;
  principal_contractor: string | null;
  principal_designer: string | null;
  cdm_notifiable: boolean;
  f10_reference: string | null;
  start_date: string | null;
  end_date: string | null;
  access_notes: string | null;
  welfare_notes: string | null;
  nearest_hospital: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectFile = {
  id: string;
  project_id: string;
  title: string | null;
  kind: 'survey' | 'drawing' | 'photo' | 'permit' | 'spec' | 'other';
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

// --- RAMS body -------------------------------------------------------------

/** One row of the risk assessment table. */
export type HazardEntry = {
  id: string;
  /** Id of the library entry this came from, or null if hand-written. */
  libraryId: string | null;
  hazard: string;
  whoIsAtRisk: string[];
  initialLikelihood: number;
  initialSeverity: number;
  controls: string[];
  residualLikelihood: number;
  residualSeverity: number;
  /** Free-text note appended to the row on the report. */
  additionalControls?: string;
};

/** One step of the method statement. */
export type MethodStep = {
  id: string;
  title: string;
  detail: string;
  /** Who carries out the step, e.g. "Lead installer + mate". */
  responsible?: string;
  /** Hold point requiring a signature before continuing. */
  holdPoint?: boolean;
};

export type PlantItem = {
  id: string;
  name: string;
  /** Inspection / certification requirement, e.g. "LOLER thorough exam". */
  inspection?: string;
  notes?: string;
};

export type CoshhItem = {
  id: string;
  substance: string;
  hazard: string;
  controls: string;
  /** Where the safety data sheet is held. */
  sdsLocation?: string;
};

export type RamsContent = {
  /** Free-text description of the works this document covers. */
  scopeOfWorks: string;
  /** Locations/areas the document applies to. */
  workAreas: string;
  /** Expected duration and working hours. */
  duration: string;
  /** Number and make-up of the install team. */
  personnel: string;
  /** Competence statement — training and cards required. */
  competence: string;

  hazards: HazardEntry[];
  sequence: MethodStep[];

  plant: PlantItem[];
  ppe: string[];
  coshh: CoshhItem[];
  permits: string[];

  welfare: string;
  firstAid: string;
  emergencyProcedure: string;
  /** Working-at-height rescue plan — mandatory where WAH applies. */
  rescuePlan: string;
  environmental: string;
  monitoring: string;
  legislation: string[];

  /** Site-specific additions the author types in. */
  siteSpecificNotes: string;

  /** Ids of certifications attached as an appendix. */
  attachedCertificationIds: string[];
  /** Ids of profiles named as operatives. */
  operativeIds: string[];
  /** Operatives who aren't registered users (subcontractors). */
  externalOperatives: { id: string; name: string; role: string; company: string }[];
};

export type RamsDocument = {
  id: string;
  project_id: string;
  reference: string;
  title: string;
  technology: TechnologyId;
  sector: Sector;
  version: number;
  status: RamsStatus;
  content: RamsContent;
  review_date: string | null;
  author_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShareLink = {
  id: string;
  rams_id: string;
  token_hash: string;
  label: string | null;
  recipient_email: string | null;
  expires_at: string;
  revoked_at: string | null;
  max_views: number | null;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type Briefing = {
  id: string;
  rams_id: string;
  profile_id: string | null;
  person_name: string;
  person_role: string | null;
  company: string | null;
  briefed_by: string | null;
  signed_at: string | null;
  created_at: string;
};
