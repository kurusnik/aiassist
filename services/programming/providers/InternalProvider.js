const BaseProvider = require('./BaseProvider');

class InternalProvider extends BaseProvider {
  constructor() {
    super(
      'internal',
      'Встроенные операции Programming Engine',
      ['build_prompt', 'review_result']
    );
  }
}

module.exports = InternalProvider;