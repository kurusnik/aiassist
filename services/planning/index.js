const PlanningContext = require('./PlanningContext');
const QueryPlanTranslator = require('./translators/QueryPlanTranslator');

class PlanningService {
  constructor() {
    this.translator = new QueryPlanTranslator();
  }

  translate(queryPlan, taskContext) {
    return this.translator.translate(queryPlan, taskContext);
  }

  createContext(queryPlan, taskContext) {
    return new PlanningContext(queryPlan, taskContext);
  }
}

module.exports = new PlanningService();
module.exports.PlanningContext = PlanningContext;
module.exports.QueryPlanTranslator = QueryPlanTranslator;