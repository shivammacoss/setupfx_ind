/**
 * Bonus Auto-Trigger Service
 * Automatically grants deposit bonuses when a deposit is approved.
 */
const BonusTemplate = require('../models/BonusTemplate');
const UserBonus = require('../models/UserBonus');

/**
 * Compute bonus amount from a template and deposit amount (INR).
 */
function computeBonus(template, depositINR) {
  let bonus = 0;
  if (template.bonusType === 'percentage') {
    bonus = (depositINR * template.value) / 100;
  } else {
    bonus = template.value;
  }
  if (template.maxBonus != null && template.maxBonus > 0 && bonus > template.maxBonus) {
    bonus = template.maxBonus;
  }
  return Math.round(bonus * 100) / 100;
}

/**
 * Find best matching template for a given type and deposit amount.
 */
async function findMatchingTemplate(type, depositINR) {
  const templates = await BonusTemplate.find({ type, isActive: true }).sort({ value: -1 });
  for (const tpl of templates) {
    if (depositINR >= (tpl.minimumDeposit || 0)) {
      return tpl;
    }
  }
  return null;
}

/**
 * Maybe grant a deposit bonus. First try first_deposit if isFirstDeposit,
 * then fall back to regular_deposit template.
 *
 * @param {Object} user - Mongoose user doc (must have wallet.credit, _id, oderId)
 * @param {Number} depositINR - Deposit amount in INR
 * @param {Boolean} isFirstDeposit - Whether this is user's first deposit
 * @param {Number} usdInrRate - Live USD/INR rate
 * @param {String} [transactionId] - Optional transaction ID for linking
 * @returns {{ bonusINR, bonusUSD, templateName } | null}
 */
async function maybeGrantDepositBonus(user, depositINR, isFirstDeposit, usdInrRate, transactionId = null) {
  let template = null;

  // First try first_deposit template if this is a first deposit
  if (isFirstDeposit) {
    template = await findMatchingTemplate('first_deposit', depositINR);
  }

  // Fall back to regular_deposit if no first_deposit match
  if (!template) {
    template = await findMatchingTemplate('regular_deposit', depositINR);
  }

  if (!template) return null;

  const bonusINR = computeBonus(template, depositINR);
  if (bonusINR <= 0) return null;

  const bonusUSD = bonusINR / (usdInrRate || 83);

  // Credit the bonus to user wallet
  user.wallet.credit = (user.wallet.credit || 0) + bonusUSD;
  user.wallet.equity = user.wallet.balance + user.wallet.credit;
  user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;

  // Record the bonus
  await UserBonus.create({
    userId: user._id,
    oderId: user.oderId,
    templateId: template._id,
    templateName: template.name,
    type: template.type,
    bonusType: template.bonusType,
    depositAmountINR: depositINR,
    bonusAmountINR: bonusINR,
    bonusAmountUSD: bonusUSD,
    transactionId,
    status: 'active'
  });

  return {
    bonusINR,
    bonusUSD,
    templateName: template.name,
    templateType: template.type
  };
}

module.exports = {
  maybeGrantDepositBonus,
  computeBonus,
  findMatchingTemplate
};
