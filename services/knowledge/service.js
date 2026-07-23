const pool = require('../../db');

class KnowledgeService {
  async getObject(identifier) {
    if (!identifier) return null;

    const isFullName = identifier.includes('.');
    const row = isFullName
      ? (await pool.query(`SELECT * FROM knowledge.objects WHERE full_name = $1`, [identifier])).rows[0]
      : (await pool.query(`SELECT * FROM knowledge.objects WHERE name = $1`, [identifier])).rows[0];

    if (!row) return null;

    const fields = await this.getFields(row.id);

    return { ...row, fields };
  }

  async findObjects(query) {
    if (!query || !query.trim()) return [];

    const pattern = `%${query.trim()}%`;
    const result = await pool.query(
      `SELECT * FROM knowledge.objects
       WHERE name ILIKE $1 OR synonym ILIKE $1 OR full_name ILIKE $1
       ORDER BY name`,
      [pattern]
    );

    return result.rows;
  }

  async getFields(objectId) {
    if (!objectId) return [];

    const result = await pool.query(
      `SELECT * FROM knowledge.fields WHERE object_id = $1 ORDER BY name`,
      [objectId]
    );

    return result.rows;
  }

  async health() {
    const objResult = await pool.query(`SELECT COUNT(*)::int AS count FROM knowledge.objects`);
    const fldResult = await pool.query(`SELECT COUNT(*)::int AS count FROM knowledge.fields`);
    const cfgResult = await pool.query(`SELECT MAX(created_at) AS imported_at FROM knowledge.configurations`);

    return {
      objects: objResult.rows[0].count,
      fields: fldResult.rows[0].count,
      importedAt: cfgResult.rows[0].imported_at || null
    };
  }
}

module.exports = new KnowledgeService();
