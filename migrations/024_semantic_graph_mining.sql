-- Migration 024: Semantic Graph Mining tables
-- Stores the semantic graph built from Knowledge Layer metadata.
-- Nodes = 1C objects mapped to business concepts
-- Edges = semantic relationships discovered from field types
-- Suggestions = business concept candidates for user confirmation

CREATE TABLE IF NOT EXISTS semantic_graph_nodes (
  id SERIAL PRIMARY KEY,
  concept TEXT NOT NULL,
  object_name TEXT NOT NULL,
  node_type TEXT NOT NULL DEFAULT 'metadata_object',
  confidence REAL DEFAULT 0.8,
  source TEXT DEFAULT 'knowledge_layer',
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(concept, object_name, project_id)
);

CREATE INDEX IF NOT EXISTS idx_sgn_concept ON semantic_graph_nodes(concept);
CREATE INDEX IF NOT EXISTS idx_sgn_object ON semantic_graph_nodes(object_name);
CREATE INDEX IF NOT EXISTS idx_sgn_project ON semantic_graph_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_sgn_type ON semantic_graph_nodes(node_type);

CREATE TABLE IF NOT EXISTS semantic_graph_edges (
  id SERIAL PRIMARY KEY,
  from_node INTEGER REFERENCES semantic_graph_nodes(id) ON DELETE CASCADE,
  to_node INTEGER REFERENCES semantic_graph_nodes(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  field_name TEXT,
  confidence REAL DEFAULT 0.8,
  source TEXT DEFAULT 'knowledge_layer',
  approved BOOLEAN DEFAULT TRUE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_node, to_node, relation_type, project_id)
);

CREATE INDEX IF NOT EXISTS idx_sge_from ON semantic_graph_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_sge_to ON semantic_graph_edges(to_node);
CREATE INDEX IF NOT EXISTS idx_sge_type ON semantic_graph_edges(relation_type);
CREATE INDEX IF NOT EXISTS idx_sge_project ON semantic_graph_edges(project_id);

CREATE TABLE IF NOT EXISTS semantic_suggestions (
  id SERIAL PRIMARY KEY,
  term TEXT NOT NULL,
  suggested_mapping TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  source TEXT DEFAULT 'graph_mining',
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_term ON semantic_suggestions(term);
CREATE INDEX IF NOT EXISTS idx_ss_status ON semantic_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_ss_project ON semantic_suggestions(project_id);
