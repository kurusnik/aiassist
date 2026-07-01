const BaseProvider = require('./BaseProvider');

class FilesystemProvider extends BaseProvider {
  constructor() {
    super(
      'filesystem',
      'Доступ к файловой системе проекта',
      ['collect_project_files', 'collect_examples']
    );
  }
}

module.exports = FilesystemProvider;