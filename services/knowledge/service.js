const pool = require('../../db');

const STOP_WORDS = new Set([
  'и', 'в', 'на', 'с', 'по', 'из', 'за', 'у', 'к', 'о', 'от', 'до',
  'для', 'при', 'про', 'через', 'без', 'над', 'под', 'об',
  'это', 'что', 'как', 'так', 'но', 'а', 'или', 'же', 'бы',
  'не', 'ни', 'со', 'во',
  'покажи', 'найди', 'список', 'все', 'найти', 'вывести', 'показать',
  'получить', 'сделать', 'нужно'
]);

const SUFFIXES = [
  'ами', 'ями', 'ных', 'ьных', 'овых',
  'ах', 'ях', 'ам', 'ям',
  'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
  'ом', 'ем', 'ой', 'ей', 'ую', 'юю',
  'ые', 'ие', 'ый', 'ий', 'ая', 'яя',
  'ое', 'ее', 'ых', 'их',
  'ов', 'ев', 'ей', 'ии',
  'а', 'я', 'у', 'ю', 'е', 'и', 'ы', 'о'
];

class KnowledgeService {
  _normalizeToken(token) {
    const lower = token.toLowerCase();
    const results = [lower];

    for (const suffix of SUFFIXES) {
      if (lower.length - suffix.length >= 3 && lower.endsWith(suffix)) {
        const stem = lower.slice(0, -suffix.length);
        results.push(stem);
        break;
      }
    }

    return [...new Set(results)];
  }

  _tokenize(query) {
    return query
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
  }

  async findObjects(query) {
    if (!query || !query.trim()) return [];

    const tokens = this._tokenize(query);
    if (tokens.length === 0) return [];

    const likePatterns = [];
    const allForms = [];

    for (const token of tokens) {
      const forms = this._normalizeToken(token);
      for (const form of [...new Set(forms)]) {
        allForms.push(form);
        likePatterns.push(`%${form}%`);
      }
    }

    const conditions = [];
    const whereParams = [];
    let paramIdx = 5;

    for (const form of allForms) {
      const pattern = `%${form}%`;
      conditions.push(`(
        name ILIKE $${paramIdx} OR
        synonym ILIKE $${paramIdx+1} OR
        full_name ILIKE $${paramIdx+2}
      )`);
      whereParams.push(pattern, pattern, pattern);
      paramIdx += 3;
    }

    const whereClause = conditions.join(' OR ');

const result = await pool.query(`
      SELECT *,
        CASE
          WHEN LOWER(name) = ANY($1) THEN 4
          WHEN LOWER(synonym) LIKE ANY($2) THEN 3
          WHEN LOWER(full_name) LIKE ANY($3) THEN 2
          WHEN LOWER(name) LIKE ANY($4) THEN 1
          ELSE 0
        END AS relevance
      FROM knowledge.objects
      WHERE ${whereClause}
      ORDER BY relevance DESC
    `, [
      allForms,
      likePatterns,
      likePatterns,
      likePatterns,
      ...whereParams
    ]);

    const lowerForms = allForms.map(f => f.toLowerCase());

    result.rows.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;

      const aHits = lowerForms.filter(f => {
        const low = a.name.toLowerCase();
        const syn = (a.synonym || '').toLowerCase();
        const fn = (a.full_name || '').toLowerCase();
        return low.includes(f) || syn.includes(f) || fn.includes(f);
      }).length;
      const bHits = lowerForms.filter(f => {
        const low = b.name.toLowerCase();
        const syn = (b.synonym || '').toLowerCase();
        const fn = (b.full_name || '').toLowerCase();
        return low.includes(f) || syn.includes(f) || fn.includes(f);
      }).length;

      if (bHits !== aHits) return bHits - aHits;

      return a.name.length - b.name.length || a.name.localeCompare(b.name);
    });

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

  async getFieldsBatch(objectIds) {
    if (!objectIds || objectIds.length === 0) return {};

    const result = await pool.query(
      `SELECT * FROM knowledge.fields WHERE object_id = ANY($1::uuid[]) ORDER BY object_id, name`,
      [objectIds]
    );

    const map = {};
    for (const row of result.rows) {
      if (!map[row.object_id]) map[row.object_id] = [];
      map[row.object_id].push(row);
    }

    for (const id of objectIds) {
      if (!map[id]) map[id] = [];
    }

    return map;
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
