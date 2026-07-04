const pool = require('../../db');

class ProjectContextService {
  async load(projectId) {
    try {
      const [projectResult, messagesResult, attachmentsResult, docEmbeddingsResult, msgEmbeddingsResult] =
        await Promise.all([
          pool.query('SELECT * FROM projects WHERE id = $1', [projectId]),
          pool.query(
            'SELECT role, content, created_at FROM messages WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20',
            [projectId]
          ),
          pool.query(
            'SELECT id, filename, original_name, mime, size, created_at FROM attachments WHERE project_id = $1 ORDER BY created_at DESC',
            [projectId]
          ),
          pool.query(
            'SELECT COUNT(*)::int as count, MAX(created_at) as last_indexed FROM document_embeddings WHERE project_id = $1',
            [projectId]
          ),
          pool.query(
            'SELECT COUNT(*)::int as count FROM message_embeddings WHERE project_id = $1',
            [projectId]
          )
        ]);

      const project = projectResult.rows[0] || {};

      return {
        projectId,
        project: {
          id: project.id || null,
          name: project.name || null,
          summary: project.summary || null
        },
        history: messagesResult.rows.map(r => ({
          role: r.role,
          content: r.content,
          createdAt: r.created_at
        })),
        files: attachmentsResult.rows.map(r => ({
          id: r.id,
          filename: r.filename,
          originalName: r.original_name,
          mime: r.mime,
          size: r.size,
          createdAt: r.created_at
        })),
        rag: {
          indexedDocuments: docEmbeddingsResult.rows[0]?.count || 0,
          indexedMessages: msgEmbeddingsResult.rows[0]?.count || 0,
          lastIndexed: docEmbeddingsResult.rows[0]?.last_indexed || null,
          hasKnowledge: (docEmbeddingsResult.rows[0]?.count || 0) > 0
        },
        metadata: {
          createdAt: project.created_at || null,
          updatedAt: project.updated_at || null,
          ownerId: project.user_id || null
        }
      };
    } catch (error) {
      console.error('[ProjectContextService] Load error:', error.message);
      return {
        projectId,
        project: {},
        history: [],
        files: [],
        rag: null,
        metadata: {}
      };
    }
  }
}

module.exports = ProjectContextService;