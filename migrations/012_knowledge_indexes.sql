-- Sprint 4.3: Knowledge indexes for performance
-- Index on full_name for relations import and RelationResolver queries
-- Используем hash-индекс для точного поиска (основной паттерн: WHERE full_name = $1)
-- Hash-индекс не имеет ограничения на размер значения (в отличие от B-tree с лимитом ~8KB на запись)

DROP INDEX IF EXISTS knowledge.idx_knowledge_objects_full_name;
CREATE INDEX IF NOT EXISTS idx_knowledge_objects_full_name
  ON knowledge.objects USING hash (full_name);

-- Ограничение длины full_name: типовое полное имя 1С-объекта редко превышает 200 символов
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_full_name_length'
  ) THEN
    ALTER TABLE knowledge.objects ADD CONSTRAINT ck_full_name_length
      CHECK (length(full_name) < 4000);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_knowledge_relations_from
  ON knowledge.relations (from_object_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_relations_to
  ON knowledge.relations (to_object_id);

-- Используем hash-индекс для reference_type, т.к. поле содержит список типов (через запятую)
-- длиной до 97KB, что превышает лимит B-tree (~8KB на запись)
DROP INDEX IF EXISTS knowledge.idx_knowledge_fields_reference_type;
CREATE INDEX IF NOT EXISTS idx_knowledge_fields_reference_type
  ON knowledge.fields USING hash (reference_type)
  WHERE reference_type IS NOT NULL;