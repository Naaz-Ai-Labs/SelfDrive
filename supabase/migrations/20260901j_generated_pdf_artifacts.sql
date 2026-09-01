-- Generated inspection-report PDFs (handover/return) are regenerated from scratch on
-- every view today: 6+ DB queries, up to 13 Storage downloads, a full pdfkit render —
-- measured ~4.2s per view, repeated identically for every staff member who opens the
-- same booking. This lets the route generate once, store the artifact, and serve it
-- on every subsequent view.
--
-- Reuses the existing `documents` table (entity_type/entity_id/kind/name/path/size) —
-- already shaped for exactly this and, before this migration, written by no code path
-- at all (0 rows in production). No new table.
--
-- The unique constraint is the concurrency guard: if two staff open the same
-- never-yet-generated booking PDF at the same moment, both may render (rare, bounded,
-- cheap to accept per pdf-optimization-report.md), but only one row survives the
-- upsert — the route always upserts on this same conflict target, so the second
-- write never creates a duplicate/orphaned artifact.
ALTER TABLE public.documents
  ADD CONSTRAINT documents_entity_kind_unique UNIQUE (entity_type, entity_id, kind);
