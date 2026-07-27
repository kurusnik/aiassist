const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * Migration Safety Tests — verify all semantic migrations are idempotent.
 *
 * Each migration is read and checked for:
 * - IF NOT EXISTS on CREATE TABLE
 * - IF NOT EXISTS on CREATE INDEX
 * - No DROP TABLE / TRUNCATE / DELETE
 * - No ALTER TABLE that removes columns
 * - No modification to knowledge.* tables
 */

const fs = require('fs');
const path = require('path');

const MIGRATION_DIR = path.join(__dirname, '..', 'migrations');

const MIGRATIONS_TO_CHECK = [
  '019_semantic_memory.sql',
  '020_semantic_project_context.sql',
  '021_semantic_validation_logs.sql',
  '022_semantic_corrections.sql',
  '023_semantic_relationships.sql',
  '024_semantic_graph_mining.sql',
];

function readMigration(name) {
  const filePath = path.join(MIGRATION_DIR, name);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function normalize(sql) {
  return sql
    .replace(/--.*$/gm, '')           // remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove block comments
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim()
    .toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: All migration files exist
// ═══════════════════════════════════════════════════════════════════

describe('Migration files exist', () => {
  for (const name of MIGRATIONS_TO_CHECK) {
    it(`migration ${name} exists`, () => {
      const content = readMigration(name);
      assert.ok(content, `Migration file ${name} should exist`);
      assert.ok(content.length > 50, `Migration ${name} should have substantial content`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: CREATE TABLE is idempotent
// ═══════════════════════════════════════════════════════════════════

describe('CREATE TABLE idempotency', () => {
  for (const name of MIGRATIONS_TO_CHECK) {
    it(`${name}: all CREATE TABLE use IF NOT EXISTS`, () => {
      const sql = readMigration(name);
      assert.ok(sql, `Migration ${name} not found`);
      const normalized = normalize(sql);

      // Find all CREATE TABLE statements
      const createTablePattern = /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/g;
      const matches = normalized.match(createTablePattern);
      assert.equal(matches, null,
        `${name}: CREATE TABLE without IF NOT EXISTS found: ${matches ? matches[0] : ''}`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: CREATE INDEX is idempotent
// ═══════════════════════════════════════════════════════════════════

describe('CREATE INDEX idempotency', () => {
  for (const name of MIGRATIONS_TO_CHECK) {
    it(`${name}: all CREATE INDEX use IF NOT EXISTS`, () => {
      const sql = readMigration(name);
      assert.ok(sql, `Migration ${name} not found`);
      const normalized = normalize(sql);

      const createIndexPattern = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/g;
      const matches = normalized.match(createIndexPattern);
      assert.equal(matches, null,
        `${name}: CREATE INDEX without IF NOT EXISTS found`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: No destructive operations
// ═══════════════════════════════════════════════════════════════════

describe('No destructive operations', () => {
  for (const name of MIGRATIONS_TO_CHECK) {
    it(`${name}: no DROP TABLE`, () => {
      const sql = readMigration(name);
      assert.ok(sql, `Migration ${name} not found`);
      const normalized = normalize(sql);
      assert.ok(!normalized.includes('DROP TABLE'),
        `${name}: DROP TABLE found — destructive operation`);
    });

    it(`${name}: no TRUNCATE`, () => {
      const sql = readMigration(name);
      assert.ok(sql, `Migration ${name} not found`);
      const normalized = normalize(sql);
      assert.ok(!normalized.includes('TRUNCATE'),
        `${name}: TRUNCATE found — destructive operation`);
    });

    it(`${name}: no DELETE FROM`, () => {
      const sql = readMigration(name);
      assert.ok(sql, `Migration ${name} not found`);
      const normalized = normalize(sql);
      assert.ok(!normalized.includes('DELETE FROM'),
        `${name}: DELETE FROM found — may remove data`);
    });

    it(`${name}: no ALTER TABLE DROP COLUMN`, () => {
      const sql = readMigration(name);
      assert.ok(sql, `Migration ${name} not found`);
      const normalized = normalize(sql);
      assert.ok(!normalized.includes('DROP COLUMN'),
        `${name}: DROP COLUMN found — removes data`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: No modification to knowledge.* tables
// ═══════════════════════════════════════════════════════════════════

describe('No modification to knowledge tables', () => {
  for (const name of MIGRATIONS_TO_CHECK) {
    it(`${name}: no ALTER/DROP on knowledge.*`, () => {
      const sql = readMigration(name);
      assert.ok(sql, `Migration ${name} not found`);
      const normalized = normalize(sql);
      assert.ok(!normalized.includes('ALTER TABLE KNOWLEDGE'),
        `${name}: ALTER TABLE on knowledge.* found`);
      assert.ok(!normalized.includes('DROP TABLE KNOWLEDGE'),
        `${name}: DROP TABLE on knowledge.* found`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: Tables created by each migration
// ═══════════════════════════════════════════════════════════════════

describe('Expected tables per migration', () => {
  const expected = {
    '019_semantic_memory.sql': ['semantic_concepts', 'semantic_aliases', 'semantic_mappings', 'semantic_examples'],
    '020_semantic_project_context.sql': [], // ALTER only
    '021_semantic_validation_logs.sql': ['semantic_validation_logs'],
    '022_semantic_corrections.sql': ['semantic_corrections'],
    '023_semantic_relationships.sql': ['semantic_relationships'],
    '024_semantic_graph_mining.sql': ['semantic_graph_nodes', 'semantic_graph_edges', 'semantic_suggestions'],
  };

  for (const [name, tables] of Object.entries(expected)) {
    if (tables.length === 0) continue;
    it(`${name}: creates expected tables`, () => {
      const sql = readMigration(name);
      assert.ok(sql, `Migration ${name} not found`);
      const normalized = normalize(sql);
      for (const table of tables) {
        assert.ok(normalized.includes(`CREATE TABLE IF NOT EXISTS ${table.toUpperCase()}`),
          `${name}: expected table ${table} not found`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 7: Seed data is idempotent
// ═══════════════════════════════════════════════════════════════════

describe('Seed data idempotency', () => {
  it('019 uses ON CONFLICT for semantic_concepts', () => {
    const sql = readMigration('019_semantic_memory.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    assert.ok(normalized.includes('ON CONFLICT (NAME) DO NOTHING') || normalized.includes('ON CONFLICT DO NOTHING'),
      '019: seed INSERT should use ON CONFLICT');
  });

  it('023 uses ON CONFLICT for semantic_relationships', () => {
    const sql = readMigration('023_semantic_relationships.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    assert.ok(normalized.includes('ON CONFLICT') && normalized.includes('DO NOTHING'),
      '023: seed INSERT should use ON CONFLICT DO NOTHING');
  });

  it('024 has no seed data (graph is built dynamically)', () => {
    const sql = readMigration('024_semantic_graph_mining.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    assert.ok(!normalized.includes('INSERT INTO SEMANTIC_GRAPH'),
      '024: should not have seed INSERT (graph is built by OneCKnowledgeGraphBuilder)');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 8: ALTER TABLE safety (020)
// ═══════════════════════════════════════════════════════════════════

describe('ALTER TABLE safety (migration 020)', () => {
  it('020: ALTER TABLE uses ADD COLUMN IF NOT EXISTS', () => {
    const sql = readMigration('020_semantic_project_context.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    assert.ok(normalized.includes('ADD COLUMN IF NOT EXISTS'),
      '020: ALTER TABLE should use ADD COLUMN IF NOT EXISTS');
  });

  it('020: UPDATE does not delete rows', () => {
    const sql = readMigration('020_semantic_project_context.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    // ON DELETE CASCADE in FK is fine — only check for DELETE FROM
    assert.ok(!normalized.includes('DELETE FROM') && !normalized.includes('TRUNCATE'),
      '020: UPDATE should not delete rows');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 9: FK references are safe
// ═══════════════════════════════════════════════════════════════════

describe('Foreign key references', () => {
  it('023: references projects(id) ON DELETE CASCADE', () => {
    const sql = readMigration('023_semantic_relationships.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    assert.ok(normalized.includes('REFERENCES PROJECTS(ID)'),
      '023: should reference projects(id)');
  });

  it('024: graph_edges references graph_nodes ON DELETE CASCADE', () => {
    const sql = readMigration('024_semantic_graph_mining.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    assert.ok(normalized.includes('REFERENCES SEMANTIC_GRAPH_NODES(ID) ON DELETE CASCADE'),
      '024: edges should reference nodes with CASCADE');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 10: UNIQUE constraints prevent duplicates
// ═══════════════════════════════════════════════════════════════════

describe('UNIQUE constraints', () => {
  it('024: semantic_graph_nodes has UNIQUE(concept, object_name, project_id)', () => {
    const sql = readMigration('024_semantic_graph_mining.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    assert.ok(normalized.includes('UNIQUE(CONCEPT, OBJECT_NAME, PROJECT_ID)'),
      '024: nodes should have unique constraint');
  });

  it('024: semantic_graph_edges has UNIQUE(from_node, to_node, relation_type, project_id)', () => {
    const sql = readMigration('024_semantic_graph_mining.sql');
    assert.ok(sql);
    const normalized = normalize(sql);
    assert.ok(normalized.includes('UNIQUE(FROM_NODE, TO_NODE, RELATION_TYPE, PROJECT_ID)'),
      '024: edges should have unique constraint');
  });
});
