-- Sprint 023: OneC Semantic Translator — Semantic Memory Storage
-- Таблицы для хранения семантических концепций, алиасов, маппингов и примеров

CREATE TABLE IF NOT EXISTS semantic_concepts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS semantic_aliases (
  id SERIAL PRIMARY KEY,
  concept_id INTEGER NOT NULL REFERENCES semantic_concepts(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  UNIQUE(concept_id, alias)
);

CREATE TABLE IF NOT EXISTS semantic_mappings (
  id SERIAL PRIMARY KEY,
  concept_id INTEGER NOT NULL REFERENCES semantic_concepts(id) ON DELETE CASCADE,
  metadata_object TEXT NOT NULL,
  metadata_field TEXT,
  mapping_type TEXT NOT NULL DEFAULT 'attribute',
  confidence REAL NOT NULL DEFAULT 0.8,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS semantic_examples (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  resolved_plan JSONB NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  confidence REAL NOT NULL DEFAULT 0.95,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_semantic_aliases_alias ON semantic_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_semantic_mappings_object ON semantic_mappings(metadata_object);
CREATE INDEX IF NOT EXISTS idx_semantic_mappings_approved ON semantic_mappings(approved);
CREATE INDEX IF NOT EXISTS idx_semantic_examples_question ON semantic_examples USING gin(to_tsvector('russian', question));

-- Начальные семантические концепции

INSERT INTO semantic_concepts (name) VALUES
  ('продажи'),
  ('бренд'),
  ('остатки'),
  ('себестоимость'),
  ('партия'),
  ('клиент'),
  ('контрагент'),
  ('номенклатура'),
  ('товар'),
  ('заказ'),
  ('реализация')
ON CONFLICT (name) DO NOTHING;

-- Начальные алиасы

INSERT INTO semantic_aliases (concept_id, alias)
SELECT c.id, v.alias
FROM semantic_concepts c
JOIN (VALUES
  ('бренд', 'торговая марка'),
  ('бренд', 'производитель'),
  ('бренд', 'марка'),
  ('продажи', 'реализация'),
  ('продажи', 'отгрузка'),
  ('продажи', 'продажа'),
  ('остатки', 'баланс'),
  ('остатки', 'складские остатки'),
  ('остатки', 'остаток'),
  ('партия', 'серия'),
  ('партия', 'лот'),
  ('клиент', 'покупатель'),
  ('клиент', 'заказчик'),
  ('контрагент', 'клиент'),
  ('контрагент', 'поставщик'),
  ('контрагент', 'партнёр'),
  ('номенклатура', 'товар'),
  ('номенклатура', 'услуга'),
  ('номенклатура', 'материал'),
  ('товар', 'продукция'),
  ('товар', 'изделие'),
  ('заказ', 'ордер'),
  ('заказ', 'заявка'),
  ('реализация', 'продажа'),
  ('реализация', 'отгрузка')
) AS v(cname, alias)
ON c.name = v.cname
WHERE NOT EXISTS (
  SELECT 1 FROM semantic_aliases sa WHERE sa.concept_id = c.id AND sa.alias = v.alias
);

-- Начальные маппинги (неподтверждённые, confidence=0.8)

INSERT INTO semantic_mappings (concept_id, metadata_object, metadata_field, mapping_type, confidence, approved)
SELECT c.id, v.metadata_object, v.metadata_field, v.mapping_type, v.confidence, v.approved
FROM semantic_concepts c
JOIN (VALUES
  ('продажи',   'Документ.РеализацияТоваровУслуг',  NULL,                          'document',  0.85, FALSE),
  ('продажи',   'РегистрНакопления.Продажи',        NULL,                          'register',  0.80, FALSE),
  ('бренд',     'Справочник.Номенклатура',           'ДополнительныеРеквизиты.Бренд', 'attribute', 0.85, FALSE),
  ('остатки',   'РегистрНакопления.ТоварыНаСкладах', NULL,                          'register',  0.90, FALSE),
  ('партия',    'РегистрНакопления.ПартииТоваров',   NULL,                          'register',  0.85, FALSE),
  ('партия',    'Справочник.Номенклатура',            'Партия',                      'attribute', 0.80, FALSE),
  ('клиент',    'Справочник.Контрагенты',            NULL,                          'catalog',   0.90, FALSE),
  ('контрагент','Справочник.Контрагенты',            NULL,                          'catalog',   0.95, TRUE),
  ('номенклатура','Справочник.Номенклатура',         NULL,                          'catalog',   0.95, TRUE),
  ('товар',     'Справочник.Номенклатура',           NULL,                          'catalog',   0.90, FALSE),
  ('заказ',     'Документ.ЗаказКлиента',             NULL,                          'document',  0.85, FALSE),
  ('реализация','Документ.РеализацияТоваровУслуг',   NULL,                          'document',  0.90, TRUE)
) AS v(cname, metadata_object, metadata_field, mapping_type, confidence, approved)
ON c.name = v.cname
WHERE NOT EXISTS (
  SELECT 1 FROM semantic_mappings sm
  WHERE sm.concept_id = c.id AND sm.metadata_object = v.metadata_object
  AND (sm.metadata_field IS NOT DISTINCT FROM v.metadata_field)
);

-- Начальные примеры

INSERT INTO semantic_examples (question, resolved_plan, approved) VALUES
  ('покажи продажи по брендам', '{
    "businessConcept": "sales_analysis",
    "resolvedEntities": [
      {"concept": "продажи", "object": "Документ.РеализацияТоваровУслуг", "confidence": 0.91},
      {"concept": "бренд", "object": "Справочник.Номенклатура", "field": "ДополнительныеРеквизиты.Бренд", "confidence": 0.87}
    ],
    "relations": [
      {"from": "РеализацияТоваровУслуг.Товары", "to": "Номенклатура", "relation": "reference"}
    ]
  }'::jsonb, TRUE),
  ('остатки по партиям', '{
    "businessConcept": "stock_balance",
    "resolvedEntities": [
      {"concept": "остатки", "object": "РегистрНакопления.ТоварыНаСкладах", "confidence": 0.90},
      {"concept": "партия", "object": "РегистрНакопления.ПартииТоваров", "confidence": 0.85}
    ],
    "relations": []
  }'::jsonb, TRUE),
  ('клиенты по продажам', '{
    "businessConcept": "sales_by_customer",
    "resolvedEntities": [
      {"concept": "продажи", "object": "Документ.РеализацияТоваровУслуг", "confidence": 0.91},
      {"concept": "клиент", "object": "Справочник.Контрагенты", "confidence": 0.90}
    ],
    "relations": [
      {"from": "РеализацияТоваровУслуг", "to": "Контрагенты", "relation": "reference"}
    ]
  }'::jsonb, TRUE)
ON CONFLICT DO NOTHING;