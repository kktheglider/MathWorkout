export function generateCandidates(count, config) {
  const candidates = [];
  const min = config?.min || 2;
  const max = config?.max || 999;
  
  for (let i = 0; i < count; i++) {
    const n1 = Math.floor(Math.random() * (max - min + 1)) + min;
    const n2 = Math.floor(Math.random() * (max - min + 1)) + min;
    candidates.push({ n1, n2 });
  }
  return candidates;
}

export function extractFeatures(n1, n2) {
  const s1 = n1.toString();
  const s2 = n2.toString();
  
  const d1 = s1.split('').map(Number);
  const d2 = s2.split('').map(Number);
  const allDigits = [...d1, ...d2];

  // High-digit density (6-9)
  const highDigitDensity = allDigits.filter(d => d >= 6).length;
  const smallDigitDensity = allDigits.filter(d => d <= 3).length;

  // Easy Patterns
  const endsInZero = s1.endsWith('0') || s2.endsWith('0');
  const endsInFive = s1.endsWith('5') || s2.endsWith('5');
  const isMult25 = n1 % 25 === 0 || n2 % 25 === 0;
  const isMult50 = n1 % 50 === 0 || n2 % 50 === 0;
  
  const isRepeated = (s) => new Set(s.split('')).size === 1;
  const repeatedDigits = isRepeated(s1) || isRepeated(s2);
  
  const isPalindrome = (s) => s === s.split('').reverse().join('');
  const palindrome = isPalindrome(s1) || isPalindrome(s2);
  
  const identicalOperands = n1 === n2;
  
  const isAscending = (d) => d.every((val, i) => i === 0 || val >= d[i-1]);
  const isDescending = (d) => d.every((val, i) => i === 0 || val <= d[i-1]);
  const ascending = isAscending(d1) || isAscending(d2);
  const descending = isDescending(d1) || isDescending(d2);

  // Digit Similarity (how many digits of B are in A)
  let similarity = 0;
  const d1Counts = {};
  for(const d of d1) d1Counts[d] = (d1Counts[d] || 0) + 1;
  for(const d of d2) {
    if (d1Counts[d] > 0) {
      similarity++;
      d1Counts[d]--;
    }
  }

  // Magnitude
  const avg = (n1 + n2) / 2;
  const maxOp = Math.max(n1, n2);
  const minOp = Math.min(n1, n2);
  const diff = Math.abs(n1 - n2);

  // Carry Profile
  let totalCarries = 0;
  let maxCarryChain = 0;
  let currentChain = 0;
  let partialProductCarries = 0;
  let columnsWithCarries = new Set();
  
  // Simulate long multiplication
  // d1 is length M, d2 is length N. Let's do d1 * d2 (d1 on top, d2 on bottom)
  for (let i = d2.length - 1; i >= 0; i--) {
    let carry = 0;
    let partialCarries = 0;
    for (let j = d1.length - 1; j >= 0; j--) {
      const prod = d2[i] * d1[j] + carry;
      carry = Math.floor(prod / 10);
      if (carry > 0) {
        partialCarries++;
        totalCarries++;
        columnsWithCarries.add(d1.length - 1 - j);
      }
    }
    if (partialCarries > 0) partialProductCarries++;
  }
  
  // Simulate addition phase for carry chain approximation
  // A simplified carry chain for the final addition
  let addCarry = 0;
  let maxAddChain = 0;
  let currAddChain = 0;
  const sumStr = (n1 * n2).toString();
  // Not a perfect column-by-column tracking but gives an idea of density
  // We can just rely on the partial product carries for the core "Carry Stress" requirement.
  
  // Actually the prompt specifically says:
  // "carries in units column", "carries in tens column", "carries in hundreds column"
  // "longest consecutive carry chain"
  // Let's implement full long multiplication simulation
  let partials = [];
  for (let i = d2.length - 1; i >= 0; i--) {
    let p = d2[i] * n1;
    partials.push(p * Math.pow(10, d2.length - 1 - i));
  }
  
  // Summing partials digit by digit
  let sumCarries = 0;
  let carry = 0;
  let chain = 0;
  let maxChain = 0;
  let colCarries = { units: 0, tens: 0, hundreds: 0 };
  
  for (let pos = 0; pos < sumStr.length; pos++) {
    let colSum = carry;
    for (let p of partials) {
      const strP = p.toString();
      if (pos < strP.length) {
        colSum += parseInt(strP[strP.length - 1 - pos]);
      }
    }
    carry = Math.floor(colSum / 10);
    if (carry > 0) {
      sumCarries++;
      totalCarries++;
      chain++;
      maxChain = Math.max(maxChain, chain);
      if (pos === 0) colCarries.units++;
      if (pos === 1) colCarries.tens++;
      if (pos === 2) colCarries.hundreds++;
      columnsWithCarries.add(pos);
    } else {
      chain = 0;
    }
  }
  maxCarryChain = maxChain;

  return {
    highDigitDensity,
    smallDigitDensity,
    endsInZero,
    endsInFive,
    isMult25,
    isMult50,
    repeatedDigits,
    palindrome,
    identicalOperands,
    ascending,
    descending,
    similarity,
    avg,
    maxOp,
    minOp,
    diff,
    totalCarries,
    maxCarryChain,
    partialProductCarries,
    colCarries,
    columnsWithCarriesSize: columnsWithCarries.size
  };
}

export function modeSelector(candidates, mode, history = []) {
  if (mode === 'Random') {
    return candidates[0]; // just return first if random
  }

  if (mode === 'Carry Stress Mode' || mode === 'Carry Stress') {
    let valid = candidates.map(c => ({...c, features: extractFeatures(c.n1, c.n2)}));
    
    // Soft filter: prefer not ending in 0 or 5, and not too many small digits
    const better = valid.filter(c => !c.features.endsInZero && !c.features.endsInFive && c.features.smallDigitDensity < 3);
    if (better.length > 20) valid = better; 

    // Sort by carry complexity
    valid.sort((a, b) => {
      if (b.features.totalCarries !== a.features.totalCarries) {
        return b.features.totalCarries - a.features.totalCarries;
      }
      return b.features.maxCarryChain - a.features.maxCarryChain;
    });
    
    // Pick randomly from top 10%
    const topN = Math.max(1, Math.floor(valid.length * 0.1));
    return valid[Math.floor(Math.random() * topN)];
  }

  if (mode === 'Weakness Practice') {
    if (history.length < 25) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Determine what makes a question slow for this user
    // We compute average time and attempts for various binary features
    const featureStats = {
      highDigit: { trueTime: 0, trueCount: 0, falseTime: 0, falseCount: 0 },
      highCarry: { trueTime: 0, trueCount: 0, falseTime: 0, falseCount: 0 }
    };

    history.forEach(h => {
      let f = h.features;
      if (!f) {
        let n1 = 0, n2 = 0;
        if (h.questionText) {
          const match = h.questionText.match(/(\d+)\s*[×X*]\s*(\d+)/i);
          if (match) {
            n1 = parseInt(match[1], 10);
            n2 = parseInt(match[2], 10);
          }
        }
        f = extractFeatures(n1, n2);
      }
      
      const isHighDigit = f.highDigitDensity >= 4;
      const isHighCarry = f.totalCarries >= 4;
      
      if (isHighDigit) { featureStats.highDigit.trueTime += h.timeTaken; featureStats.highDigit.trueCount++; }
      else { featureStats.highDigit.falseTime += h.timeTaken; featureStats.highDigit.falseCount++; }
      
      if (isHighCarry) { featureStats.highCarry.trueTime += h.timeTaken; featureStats.highCarry.trueCount++; }
      else { featureStats.highCarry.falseTime += h.timeTaken; featureStats.highCarry.falseCount++; }
    });

    // Find the feature with largest difference in average time
    let targetFeature = null;
    let maxDiff = 0;
    
    const checkDiff = (key, evalFn) => {
      const t = featureStats[key];
      if (t.trueCount > 0 && t.falseCount > 0) {
        const avgTrue = t.trueTime / t.trueCount;
        const avgFalse = t.falseTime / t.falseCount;
        if (avgTrue - avgFalse > maxDiff) {
          maxDiff = avgTrue - avgFalse;
          targetFeature = evalFn;
        }
      }
    };

    checkDiff('highDigit', (c) => c.features.highDigitDensity >= 4);
    checkDiff('highCarry', (c) => c.features.totalCarries >= 4);

    const valid = candidates.map(c => ({...c, features: extractFeatures(c.n1, c.n2)}));
    let filtered = valid;
    
    if (targetFeature) {
      filtered = valid.filter(targetFeature);
    }

    if (filtered.length === 0) filtered = valid;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  return candidates[0];
}
