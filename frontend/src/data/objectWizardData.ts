import type { CatalogOption, SchemaOption, ObjectOption } from '@/types/blueprint';

/* ── Catalog options ── */
export const MOCK_CATALOGS: CatalogOption[] = [
  { id: 'cat-1', name: 'gpdip_odx_us_east_1' },
  { id: 'cat-2', name: 'gpdip_prod_shared_01' },
  { id: 'cat-3', name: 'gpdip_analytics_hub' },
  { id: 'cat-4', name: 'gpdip_staging_lake' },
];

/* ── Schemas per catalog ── */
export const MOCK_SCHEMAS: SchemaOption[] = [
  // gpdip_odx_us_east_1
  { id: 'sch-1', name: 'GPDIP_CDM', catalogId: 'cat-1', tag: 'Common Data Model', objectCount: 14 },
  { id: 'sch-2', name: 'GPDIP_OUTBOUND', catalogId: 'cat-1', tag: 'Outbound Feeds', objectCount: 6 },
  { id: 'sch-3', name: 'GPDIP_CDQ', catalogId: 'cat-1', tag: 'Quality Rules', objectCount: 9 },
  { id: 'sch-21', name: 'GPDIP_REFERENCE', catalogId: 'cat-1', tag: 'Reference Data', objectCount: 8 },
  { id: 'sch-22', name: 'GPDIP_AUDIT', catalogId: 'cat-1', tag: 'Audit Records', objectCount: 5 },
  { id: 'sch-23', name: 'GPDIP_COHORTS', catalogId: 'cat-1', tag: 'Research Cohorts', objectCount: 7 },
  { id: 'sch-24', name: 'GPDIP_RESEARCH', catalogId: 'cat-1', tag: 'Research Data', objectCount: 4 },
  // gpdip_prod_shared_01
  { id: 'sch-4', name: 'SHARED_ANALYTICS', catalogId: 'cat-2', tag: 'Analytics', objectCount: 22 },
  { id: 'sch-5', name: 'SHARED_REPORTING', catalogId: 'cat-2', tag: 'Reporting', objectCount: 11 },
  // gpdip_analytics_hub
  { id: 'sch-6', name: 'ML_FEATURES', catalogId: 'cat-3', tag: 'Features', objectCount: 18 },
  { id: 'sch-7', name: 'BI_CURATED', catalogId: 'cat-3', tag: 'Curated', objectCount: 7 },
  // gpdip_staging_lake
  { id: 'sch-8', name: 'RAW_INGEST', catalogId: 'cat-4', tag: 'Raw Ingestion', objectCount: 31 },
];

/* ── Objects (tables / views) per schema ── */
export const MOCK_OBJECTS: ObjectOption[] = [
  // GPDIP_CDM (sch-1)
  { id: 'obj-1', name: 'cdm_patient', schemaId: 'sch-1', kind: 'table', status: 'validated' },
  { id: 'obj-2', name: 'cdm_encounter', schemaId: 'sch-1', kind: 'table', status: 'validated' },
  { id: 'obj-3', name: 'cdm_observation', schemaId: 'sch-1', kind: 'view', status: 'pending' },
  { id: 'obj-4', name: 'cdm_drug_exposure', schemaId: 'sch-1', kind: 'table', status: 'validated' },
  { id: 'obj-21', name: 'cdm_condition', schemaId: 'sch-1', kind: 'table', status: 'validated' },
  { id: 'obj-22', name: 'cdm_procedure', schemaId: 'sch-1', kind: 'table', status: 'pending' },
  { id: 'obj-23', name: 'cdm_measurement', schemaId: 'sch-1', kind: 'table', status: 'validated' },
  { id: 'obj-24', name: 'cdm_visit_detail', schemaId: 'sch-1', kind: 'view', status: 'pending' },
  // GPDIP_REFERENCE (sch-21)
  { id: 'obj-25', name: 'ref_country', schemaId: 'sch-21', kind: 'table', status: 'validated' },
  { id: 'obj-26', name: 'ref_region', schemaId: 'sch-21', kind: 'table', status: 'validated' },
  { id: 'obj-27', name: 'ref_currency', schemaId: 'sch-21', kind: 'table', status: 'validated' },
  { id: 'obj-28', name: 'ref_diagnosis', schemaId: 'sch-21', kind: 'table', status: 'pending' },
  { id: 'obj-29', name: 'ref_provider', schemaId: 'sch-21', kind: 'table', status: 'validated' },
  { id: 'obj-30', name: 'ref_facility', schemaId: 'sch-21', kind: 'table', status: 'validated' },
  { id: 'obj-31', name: 'ref_drug', schemaId: 'sch-21', kind: 'table', status: 'validated' },
  { id: 'obj-32', name: 'ref_language', schemaId: 'sch-21', kind: 'view', status: 'pending' },
  // GPDIP_AUDIT (sch-22)
  { id: 'obj-33', name: 'audit_access_event', schemaId: 'sch-22', kind: 'table', status: 'validated' },
  { id: 'obj-34', name: 'audit_data_change', schemaId: 'sch-22', kind: 'table', status: 'validated' },
  { id: 'obj-35', name: 'audit_job_run', schemaId: 'sch-22', kind: 'table', status: 'pending' },
  { id: 'obj-36', name: 'audit_policy_change', schemaId: 'sch-22', kind: 'table', status: 'validated' },
  { id: 'obj-37', name: 'audit_user_activity', schemaId: 'sch-22', kind: 'view', status: 'validated' },
  // GPDIP_COHORTS (sch-23)
  { id: 'obj-38', name: 'cohort_cardiology', schemaId: 'sch-23', kind: 'table', status: 'validated' },
  { id: 'obj-39', name: 'cohort_diabetes', schemaId: 'sch-23', kind: 'table', status: 'validated' },
  { id: 'obj-40', name: 'cohort_oncology', schemaId: 'sch-23', kind: 'table', status: 'pending' },
  { id: 'obj-41', name: 'cohort_rare_disease', schemaId: 'sch-23', kind: 'table', status: 'validated' },
  { id: 'obj-42', name: 'cohort_pediatrics', schemaId: 'sch-23', kind: 'table', status: 'validated' },
  { id: 'obj-43', name: 'cohort_research_site', schemaId: 'sch-23', kind: 'view', status: 'pending' },
  { id: 'obj-44', name: 'cohort_study', schemaId: 'sch-23', kind: 'table', status: 'validated' },
  // GPDIP_RESEARCH (sch-24)
  { id: 'obj-45', name: 'research_study', schemaId: 'sch-24', kind: 'table', status: 'validated' },
  { id: 'obj-46', name: 'research_subject', schemaId: 'sch-24', kind: 'table', status: 'validated' },
  { id: 'obj-47', name: 'research_dataset', schemaId: 'sch-24', kind: 'view', status: 'pending' },
  { id: 'obj-48', name: 'research_measurement', schemaId: 'sch-24', kind: 'table', status: 'validated' },
  // GPDIP_OUTBOUND (sch-2)
  { id: 'obj-5', name: 'adx_contact', schemaId: 'sch-2', kind: 'table', status: 'validated' },
  { id: 'obj-6', name: 'adx_study_site', schemaId: 'sch-2', kind: 'materialized_view', status: 'validated' },
  { id: 'obj-7', name: 'adx_trial_arm', schemaId: 'sch-2', kind: 'table', status: 'pending' },
  { id: 'obj-8', name: 'adx_site_staff', schemaId: 'sch-2', kind: 'view', status: 'validated' },
  // GPDIP_CDQ (sch-3)
  { id: 'obj-9', name: 'dq_rule_catalog', schemaId: 'sch-3', kind: 'table', status: 'validated' },
  { id: 'obj-10', name: 'dq_run_history', schemaId: 'sch-3', kind: 'table', status: 'validated' },
  // SHARED_ANALYTICS (sch-4)
  { id: 'obj-11', name: 'fact_prescriptions', schemaId: 'sch-4', kind: 'table', status: 'validated' },
  { id: 'obj-12', name: 'dim_product', schemaId: 'sch-4', kind: 'table', status: 'validated' },
  { id: 'obj-13', name: 'dim_geography', schemaId: 'sch-4', kind: 'view', status: 'pending' },
  // SHARED_REPORTING (sch-5)
  { id: 'obj-14', name: 'rpt_weekly_summary', schemaId: 'sch-5', kind: 'materialized_view', status: 'validated' },
  // ML_FEATURES (sch-6)
  { id: 'obj-15', name: 'patient_features', schemaId: 'sch-6', kind: 'table', status: 'validated' },
  { id: 'obj-16', name: 'site_features', schemaId: 'sch-6', kind: 'table', status: 'pending' },
  // BI_CURATED (sch-7)
  { id: 'obj-17', name: 'curated_enrollment', schemaId: 'sch-7', kind: 'materialized_view', status: 'validated' },
  // RAW_INGEST (sch-8)
  { id: 'obj-18', name: 'raw_sfdc_account', schemaId: 'sch-8', kind: 'table', status: 'validated' },
  { id: 'obj-19', name: 'raw_sfdc_contact', schemaId: 'sch-8', kind: 'table', status: 'validated' },
  { id: 'obj-20', name: 'raw_veeva_vault', schemaId: 'sch-8', kind: 'table', status: 'error' },
];

/**
 * Simulate an API call to fetch schemas for a given catalog.
 * Returns schemas belonging to the selected catalog.
 */
export function getSchemasByCatalog(catalogId: string): SchemaOption[] {
  return MOCK_SCHEMAS.filter((s) => s.catalogId === catalogId);
}

/**
 * Simulate an API call to fetch objects for a given schema.
 * Returns objects belonging to the selected schema.
 */
export function getObjectsBySchema(schemaId: string): ObjectOption[] {
  return MOCK_OBJECTS.filter((o) => o.schemaId === schemaId);
}
