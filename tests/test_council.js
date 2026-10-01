/**
 * test_council.js
 * Unit test suite for Fact-Checker AI Council core logic
 */

import { VERDICT_TIERS, COUNCIL_MEMBERS, getVerdictTier, DEFAULT_MODEL } from '../src/core/types.js';
import { BiasAnalyzer } from '../src/core/bias_analyzer.js';

function runTests() {
  console.log('🧪 Starting Fact-Checker AI Council Unit Tests...');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // Test 1: Default Model
  assert(DEFAULT_MODEL === 'gemini-3.8-flash', 'Default model is gemini-3.8-flash');

  // Test 2: Council Members count and personas
  assert(COUNCIL_MEMBERS.length === 5, 'Council has exactly 5 member personas');
  const roles = COUNCIL_MEMBERS.map(m => m.role);
  assert(roles.includes('Forensic Fact & Claim Verifier'), 'Includes Forensic Fact Verifier');
  assert(roles.includes('Rhetoric & Spin Auditor'), 'Includes Rhetoric & Spin Auditor');
  assert(roles.includes('Political Spectrum & Bias Inspector'), 'Includes Political Spectrum Inspector');
  assert(roles.includes('Provenance & Forum Skeptic'), 'Includes Provenance & Forum Skeptic');
  assert(roles.includes('Council Chairman & Synthesizer'), 'Includes Council Chairman');

  // Test 3: Scoring Tiers
  assert(getVerdictTier(95).label === 'Verified Credible', 'Score 95 is Verified Credible');
  assert(getVerdictTier(75).label === 'Mostly Credible', 'Score 75 is Mostly Credible');
  assert(getVerdictTier(55).label === 'Mixed / Context Needed', 'Score 55 is Mixed / Context Needed');
  assert(getVerdictTier(35).label === 'Misleading / Unsubstantiated', 'Score 35 is Misleading');
  assert(getVerdictTier(10).label === 'False / Misinformation', 'Score 10 is False / Misinformation');

  // Test 4: Bias Analyzer
  const neutralRatios = BiasAnalyzer.computeBiasRatios('Center / Neutral');
  assert(neutralRatios.center >= 50, 'Center / Neutral dominant lean assigns majority to Center');

  const leftRatios = BiasAnalyzer.computeBiasRatios('Left-Leaning');
  assert(leftRatios.left > leftRatios.right, 'Left dominant lean assigns higher weight to Left');

  const rightRatios = BiasAnalyzer.computeBiasRatios('Right-Leaning');
  assert(rightRatios.right > rightRatios.left, 'Right dominant lean assigns higher weight to Right');

  const formattedMatrix = BiasAnalyzer.formatBiasMatrix(null);
  assert(formattedMatrix.dominantLean === 'Center / Neutral', 'Default empty matrix provides balanced fallback');

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  return failed === 0;
}

if (typeof window !== 'undefined') {
  window.runCouncilTests = runTests;
} else {
  runTests();
}
