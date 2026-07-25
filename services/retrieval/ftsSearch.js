const pool = require('../../db');
const { config } = require('./config');

async function ftsSearch(query, options = {}) {
  const {
    projectId,
    userId,
    limit = config.fts.limit,
    maxQueryLength = config.fts.maxQueryLength
  } = options;

  const cleaned = query
    .replace(/[^a-zа-яё0-9\s\-]/gi, ' ')
    .trim()
    .slice(0, maxQueryLength);

  if (!cleaned) {
    return { results: [], total: 0, query: cleaned };
  }

  const plainQuery = cleaned
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .join(' & ');

  if (!plainQuery) {
    return { results: [], total: 0, query: cleaned };
  }

  try {
    const params = [plainQuery, plainQuery];
    let paramIdx = 3;
    const filters = [];
    let filterClause = '';

    if (projectId) {
      filters.push(`(de.project_id = $${paramIdx} OR de.project_id IS NULL)`);
      params.push(projectId);
      paramIdx++;
    }

    if (userId) {
      filters.push(`(de.user_id = $${paramIdx} OR de.user_id = 1 OR de.project_id IN (SELECT id FROM projects WHERE user_id = $${paramIdx + 1}))`);
      params.push(userId, userId);
      paramIdx += 2;
    }

    if (filters.length > 0) {
      filterClause = ' AND ' + filters.join(' AND ');
    }

    const sql = `
      SELECT
        de.id,
        de.content,
        de.metadata,
        de.chunk_index,
        de.created_at,
        de.project_id,
        de.user_id,
        ts_rank(de.fts_vector, plainto_tsquery('russian', $1)) AS fts_score,
        ts_rank(de.fts_vector, to_tsquery('russian', $2)) AS fts_rank,
        p.name AS project_name,
        u.username AS user_name
      FROM document_embeddings de
      LEFT JOIN projects p ON de.project_id = p.id
      LEFT JOIN users u ON de.user_id = u.id
      WHERE de.fts_vector @@ to_tsquery('russian', $2)${filterClause}
      ORDER BY fts_rank DESC
      LIMIT $${paramIdx}
    `;

    params.push(limit);

    const result = await pool.query(sql, params);

    return {
      results: result.rows.map(row => ({
        id: row.id,
        content: row.content,
        ftsScore: parseFloat(row.fts_score) || 0,
        ftsRank: parseFloat(row.fts_rank) || 0,
        metadata: row.metadata,
        chunkIndex: row.chunk_index,
        createdAt: row.created_at,
        provenance: ['fts'],
        source: {
          projectId: row.project_id,
          projectName: row.project_name,
          userId: row.user_id,
          userName: row.user_name
        }
      })),
      total: result.rows.length,
      query: cleaned
    };
  } catch (error) {
    console.error('[FTS] Search error:', error.message);
    return { results: [], total: 0, query: cleaned, error: error.message };
  }
}

module.exports = { ftsSearch };