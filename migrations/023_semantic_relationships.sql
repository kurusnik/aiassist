-- Migration 023: semantic_relationships table
-- Stores business relationships between 1C metadata objects.
-- Used by OneCRelationshipResolver to build relationship graphs.

CREATE TABLE IF NOT EXISTS semantic_relationships (
  id SERIAL PRIMARY KEY,
  from_concept TEXT NOT NULL,
  from_object TEXT NOT NULL,
  from_field TEXT,
  relation_type TEXT NOT NULL DEFAULT 'reference',
  to_concept TEXT NOT NULL,
  to_object TEXT NOT NULL,
  to_field TEXT,
  confidence REAL DEFAULT 0.8,
  source TEXT DEFAULT 'system',
  approved BOOLEAN DEFAULT TRUE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_semantic_rel_from ON semantic_relationships(from_concept);
CREATE INDEX IF NOT EXISTS idx_semantic_rel_to ON semantic_relationships(to_concept);
CREATE INDEX IF NOT EXISTS idx_semantic_rel_from_obj ON semantic_relationships(from_object);
CREATE INDEX IF NOT EXISTS idx_semantic_rel_to_obj ON semantic_relationships(to_object);
CREATE INDEX IF NOT EXISTS idx_semantic_rel_project ON semantic_relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_semantic_rel_type ON semantic_relationships(relation_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_rel_unique
  ON semantic_relationships(from_concept, from_object, relation_type, to_concept, to_object, COALESCE(project_id, 0));

-- Seed data: known 1C business relationships

INSERT INTO semantic_relationships (from_concept, from_object, from_field, relation_type, to_concept, to_object, to_field, confidence, source)
VALUES
  -- Продажи: Реализация → Товары → Номенклатура
  ('продажи', 'Документ.РеализацияТоваровУслуг', 'Товары', 'table_part',
   'номенклатура', 'Справочник.Номенклатура', NULL, 0.95, 'system'),
  ('номенклатура', 'Документ.РеализацияТоваровУслуг.Товары', 'Номенклатура', 'reference',
   'номенклатура', 'Справочник.Номенклатура', NULL, 0.95, 'system'),

  -- Номенклатура → Бренд (ДополнительныеРеквизиты)
  ('номенклатура', 'Справочник.Номенклатура', 'ДополнительныеРеквизиты.Бренд', 'attribute',
   'бренд', 'ДополнительныеРеквизиты', 'Бренд', 0.9, 'system'),

  -- Реализация → Контрагент
  ('продажи', 'Документ.РеализацияТоваровУслуг', 'Контрагент', 'reference',
   'контрагент', 'Справочник.Контрагенты', NULL, 0.95, 'system'),
  ('контрагент', 'Документ.РеализацияТоваровУслуг', 'Контрагент', 'reference',
   'контрагент', 'Справочник.Контрагенты', NULL, 0.95, 'system'),

  -- Реализация → Организация
  ('продажи', 'Документ.РеализацияТоваровУслуг', 'Организация', 'reference',
   'организация', 'Справочник.Организации', NULL, 0.9, 'system'),

  -- Остатки: РегистрНакопления → Номенклатура
  ('остатки', 'РегистрНакопления.ТоварыНаСкладах', 'Номенклатура', 'dimension',
   'номенклатура', 'Справочник.Номенклатура', NULL, 0.95, 'system'),

  -- Остатки: РегистрНакопления → Склад
  ('остатки', 'РегистрНакопления.ТоварыНаСкладах', 'Склад', 'dimension',
   'склад', 'Справочник.Склады', NULL, 0.95, 'system'),

  -- Остатки: РегистрНакопления → Партия
  ('остатки', 'РегистрНакопления.ТоварыНаСкладах', 'Партия', 'dimension',
   'партия', 'Справочник.Партии', NULL, 0.9, 'system'),

  -- Заказы: Документ.ЗаказКлиента → Контрагент
  ('заказы', 'Документ.ЗаказКлиента', 'Контрагент', 'reference',
   'контрагент', 'Справочник.Контрагенты', NULL, 0.95, 'system'),

  -- Заказы: Документ.ЗаказКлиента → Товары → Номенклатура
  ('заказы', 'Документ.ЗаказКлиента', 'Товары', 'table_part',
   'номенклатура', 'Справочник.Номенклатура', NULL, 0.9, 'system')
ON CONFLICT (from_concept, from_object, relation_type, to_concept, to_object, COALESCE(project_id, 0)) DO NOTHING;
