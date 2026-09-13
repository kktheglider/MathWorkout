/*
 * Math Exponents: which powers a difficulty can sensibly ask for.
 *
 * The operand range per difficulty is fixed in Game.jsx and is not ours to
 * change, so the power is the only lever left. Multiplied out, the two settings
 * decide how many digits the answer has, and past about seven digits the
 * question stops being mental arithmetic and becomes transcription:
 *
 *   difficulty    operands    n^2      n^3          n^4              n^5
 *   Easy            1-10      100      1,000        10,000           100,000
 *   Medium         11-20      400      8,000        160,000          3,200,000
 *   Hard           21-50    2,500    125,000      6,250,000        312,500,000
 *   Challenging   51-100   10,000  1,000,000    100,000,000     10,000,000,000
 *   Expert       101-999  998,001  997,002,999  ~9.96e11          ~9.95e14
 *
 * The caps below keep every combination at or under seven digits. Expert
 * squares are already six digits, which is why Expert offers nothing else.
 *
 * This module is the single source of truth: the menu offers these powers, the
 * Learn screen reads the stored choice, and Game.jsx clamps to them again at
 * generation time - the difficulty can be changed from the Results screen after
 * the power was chosen, so the menu's guard alone is not enough.
 */

export const EXPONENT_POWER_KEY = 'mathExponents_power';
export const EXPONENT_POWERS = ['2', '3', '4', '5'];
export const POWER_SUPERSCRIPT = { 2: '²', 3: '³', 4: '⁴', 5: '⁵' };

const MAX_POWER_BY_DIFFICULTY = {
  Easy: 5,
  Medium: 4,
  Hard: 3,
  Challenging: 3,
  Expert: 2,
};

export const maxExponentPower = (difficulty) => MAX_POWER_BY_DIFFICULTY[difficulty] ?? 2;

export const allowedExponentPowers = (difficulty) => {
  const max = maxExponentPower(difficulty);
  return EXPONENT_POWERS.filter((p) => Number(p) <= max);
};

/* The difficulty actually in force for a mode: the per-mode override if one is
   set, otherwise the global default. Mirrors how Game.jsx resolves it. */
export const readModeDifficulty = (mode) => {
  try {
    const raw = localStorage.getItem('mathWorkoutSettings');
    if (!raw) return 'Expert';
    const settings = JSON.parse(raw) || {};
    return settings.modeDifficulties?.[mode] || settings.difficulty || 'Expert';
  } catch {
    return 'Expert';
  }
};

/* Reads the stored power. Pass a difficulty to have it clamped to what that
   difficulty can ask; without one you get the raw stored preference. */
export const readExponentPower = (difficulty) => {
  let power = '2';
  try {
    const saved = localStorage.getItem(EXPONENT_POWER_KEY);
    if (EXPONENT_POWERS.includes(saved)) power = saved;
  } catch {
    /* storage unavailable - fall back to squares */
  }
  if (difficulty === undefined) return power;
  const max = maxExponentPower(difficulty);
  return Number(power) <= max ? power : String(max);
};

export const writeExponentPower = (power) => {
  try {
    if (EXPONENT_POWERS.includes(String(power))) {
      localStorage.setItem(EXPONENT_POWER_KEY, String(power));
    }
  } catch {
    /* storage unavailable (private mode) - session state only */
  }
};
