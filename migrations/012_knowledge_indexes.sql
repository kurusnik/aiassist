-- Sprint 4.3: Knowledge indexes for performance
-- Index on full_name for relations import and RelationResolver queries

CREATE INDEX IF NOT EXISTS idx_knowledge_objects_full_name
  ON knowledge.objects (full_name);

CREATE INDEX IF NOT EXISTS idx_knowledge_relations_from
  ON knowledge.relations (from_object_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_relations_to
  ON knowledge.relations (to_object_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_fields_reference_type
  ON knowledge.fields (reference_type)
  WHERE reference_type IS NOT NULL;