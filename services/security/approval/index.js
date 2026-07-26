const ApprovalRequest = require('./ApprovalRequest');
const ApprovalStore = require('./ApprovalStore');
const ApprovalService = require('./ApprovalService');
const PostgresApprovalStore = require('./PostgresApprovalStore');

module.exports = ApprovalService;
module.exports.ApprovalRequest = ApprovalRequest;
module.exports.ApprovalStore = ApprovalStore;
module.exports.ApprovalService = ApprovalService;
module.exports.PostgresApprovalStore = PostgresApprovalStore;