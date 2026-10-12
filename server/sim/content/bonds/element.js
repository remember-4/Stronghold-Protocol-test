import { bondRecord, buffParams } from '../support/index.js';
import { ELEMENT_BOND, ELEMENT_DEFAULTS } from '../../elementState.js';
export function install(battle) {
  battle.elementBondParams = { ...ELEMENT_DEFAULTS, ...buffParams(bondRecord(ELEMENT_BOND), 'env_gbuff_new') };
}
