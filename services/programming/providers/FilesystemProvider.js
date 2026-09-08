const BaseProvider = require('./BaseProvider');
const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set([
  '.bsl', '.os', '.xml', '.json', '.md', '.txt', '.js', '.ts', '.sql'
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage'
]);

const MAX_FILES = 20;
const MAX_TOTAL_SIZE = 300 * 1024;

class FilesystemWalker {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.files = [];
    this.totalSize = 0;
    this.stoppedEarly = false;
  }

  async walk() {
    await this._walkDir(this.rootDir);
  }

  async _walkDir(dirPath) {
    let entries;
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (this._shouldStop()) {
        this.stoppedEarly = true;
        return;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await this._walkDir(fullPath);
      } else if (entry.isFile()) {
        this._processFile(fullPath, entry.name);
      }
    }
  }

  _processFile(filePath, fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) return;

    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.tmp') || lowerName.endsWith('.log')) return;

    const stats = this._safeStat(filePath);
    if (!stats) return;

    if (this.totalSize + stats.size > MAX_TOTAL_SIZE) {
      this.stoppedEarly = true;
      return;
    }

    if (this.files.length >= MAX_FILES) {
      this.stoppedEarly = true;
      return;
    }

    this.files.push({
      path: filePath,
      extension: ext,
      size: stats.size,
      content: stats.content
    });
    this.totalSize += stats.size;
  }

  _safeStat(filePath) {
    try {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      return { size: stat.size, content };
    } catch {
      return null;
    }
  }

  _shouldStop() {
    return this.files.length >= MAX_FILES || this.totalSize >= MAX_TOTAL_SIZE;
  }

  getStats() {
    const extCount = {};
    for (const f of this.files) {
      extCount[f.extension] = (extCount[f.extension] || 0) + 1;
    }
    return {
      files: this.files.length,
      totalSize: this.totalSize,
      extensions: extCount
    };
  }
}

class FilesystemProvider extends BaseProvider {
  constructor() {
    super(
      'filesystem',
      'Доступ к файловой системе проекта',
      ['collect_project_files', 'collect_examples']
    );
  }

  async execute(step, context) {
    const action = step ? step.action : null;

    if (action === 'collect_project_files') {
      return this._collectProjectFiles(context);
    }

    if (action === 'collect_examples') {
      return this._collectExamples(context);
    }

    return {
      success: false,
      provider: this.name,
      capability: action,
      data: {},
      message: `Unknown action: ${action}`
    };
  }

  async _collectProjectFiles(context) {
    const filesData = context.getData('files');
    if (filesData && Array.isArray(filesData) && filesData.length > 0) {
      context.addLogEntry({
        step: 'collect_project_files',
        provider: this.name,
        status: 'started',
        message: 'Using project files from ContextCollector'
      });

      context.collectedData.projectFiles = filesData;

      context.addLogEntry({
        step: 'collect_project_files',
        provider: this.name,
        status: 'completed',
        message: `${filesData.length} files from ContextCollector`
      });

      return {
        success: true,
        provider: this.name,
        capability: 'collect_project_files',
        data: { files: filesData },
        message: 'Using project files from ContextCollector'
      };
    }

    context.addLogEntry({
      step: 'collect_project_files',
      provider: this.name,
      status: 'started',
      message: 'Fallback to filesystem scan'
    });

    try {
      const walker = new FilesystemWalker(process.cwd());
      await walker.walk();

      context.collectedData.projectFiles = walker.files;
      context.metadata.projectStats = walker.getStats();

      const msg = walker.stoppedEarly
        ? `${walker.files.length} files collected (limit reached)`
        : `${walker.files.length} files collected`;

      context.addLogEntry({
        step: 'collect_project_files',
        provider: this.name,
        status: 'completed',
        message: msg
      });

      context.addLogEntry({
        step: 'collect_project_files',
        provider: this.name,
        status: 'completed',
        message: 'Collection completed'
      });

      return {
        success: true,
        provider: this.name,
        capability: 'collect_project_files',
        data: {
          files: walker.files,
          stats: walker.getStats()
        },
        message: msg
      };
    } catch (err) {
      context.addLogEntry({
        step: 'collect_project_files',
        provider: this.name,
        status: 'failed',
        message: `Error: ${err.message}`
      });

      return {
        success: false,
        provider: this.name,
        capability: 'collect_project_files',
        data: {},
        message: `Failed to collect project files: ${err.message}`
      };
    }
  }

  async _collectExamples(context) {
    context.addLogEntry({
      step: 'collect_examples',
      provider: this.name,
      status: 'started',
      message: 'Searching for examples...'
    });

    try {
      const candidates = [
        path.join(process.cwd(), 'examples'),
        path.join(process.cwd(), 'project', 'examples')
      ];

      let allFiles = [];
      let foundAny = false;

      for (const dir of candidates) {
        let exists = false;
        try {
          exists = fs.statSync(dir).isDirectory();
        } catch {
          exists = false;
        }

        if (!exists) continue;

        foundAny = true;
        const walker = new FilesystemWalker(dir);
        await walker.walk();
        allFiles = allFiles.concat(walker.files);
      }

      context.collectedData.examples = allFiles;

      if (foundAny && allFiles.length === 0) {
        context.addLogEntry({
          step: 'collect_examples',
          provider: this.name,
          status: 'completed',
          message: 'Examples directories found but no supported files inside'
        });

        return {
          success: true,
          provider: this.name,
          capability: 'collect_examples',
          data: { files: [], examplesFound: false },
          message: 'Examples directories found but no supported files inside'
        };
      }

      if (!foundAny) {
        context.addLogEntry({
          step: 'collect_examples',
          provider: this.name,
          status: 'completed',
          message: 'No examples directories found'
        });

        return {
          success: true,
          provider: this.name,
          capability: 'collect_examples',
          data: { files: [], examplesFound: false },
          message: 'No examples directories found'
        };
      }

      context.addLogEntry({
        step: 'collect_examples',
        provider: this.name,
        status: 'completed',
        message: `${allFiles.length} example files collected`
      });

      return {
        success: true,
        provider: this.name,
        capability: 'collect_examples',
        data: { files: allFiles, examplesFound: true },
        message: `${allFiles.length} example files collected`
      };
    } catch (err) {
      context.addLogEntry({
        step: 'collect_examples',
        provider: this.name,
        status: 'failed',
        message: `Error: ${err.message}`
      });

      return {
        success: false,
        provider: this.name,
        capability: 'collect_examples',
        data: {},
        message: `Failed to collect examples: ${err.message}`
      };
    }
  }
}

module.exports = FilesystemProvider;