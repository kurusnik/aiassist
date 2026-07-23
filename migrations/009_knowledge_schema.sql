-- Sprint 1: Knowledge Schema (MVP)
-- Схема хранения знаний о конфигурации 1С

CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE TABLE IF NOT EXISTS knowledge.configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_id UUID REFERENCES knowledge.configurations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  synonym TEXT,
  full_name TEXT,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS knowledge.fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID REFERENCES knowledge.objects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  synonym TEXT,
  datatype TEXT,
  required BOOLEAN DEFAULT FALSE,
  length INTEGER,
  precision INTEGER,
  reference_type TEXT
);

CREATE TABLE IF NOT EXISTS knowledge.relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_object_id UUID REFERENCES knowledge.objects(id) ON DELETE CASCADE,
  from_field TEXT,
  to_object_id UUID REFERENCES knowledge.objects(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL
);
