/** @snypd/core — YAML layering → validated Config with provenance (docs/02 §1–§2). */
export { loadConfig, renderConfig, formatDiagnostics, type Diagnostic, type LoadedConfig, type LoadOptions, type LayerInfo } from "./config";
export { ConfigSchema, TypeSchema, TaxonomySchema, StatusSchema, FieldSpec, ROLES, type Config, type TypeDef, type TaxonomyDef } from "./schema";
export { describeSource, type Source, type Provenance, type LayerName } from "./merge";
export { parseYaml, pathKey, parsePath, REPLACE, type Path, type Origin } from "./yaml";
export * from "./content";
