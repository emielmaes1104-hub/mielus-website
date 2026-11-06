const { isActief, stuur } = require('./_lib');
module.exports = (req, res) => stuur(res, 200, { actief: isActief() });
