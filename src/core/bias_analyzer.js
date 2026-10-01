/**
 * bias_analyzer.js
 * Analyzes political framing (Left, Center, Right) and loaded language
 */

export class BiasAnalyzer {
  /**
   * Evaluates the distribution of framing between Left, Center, and Right
   */
  static formatBiasMatrix(spectrumData) {
    if (!spectrumData) {
      return {
        leftFraming: 'No specific left framing detected.',
        centerGrounding: 'Objective core events require further corroboration.',
        rightFraming: 'No specific right framing detected.',
        dominantLean: 'Center / Neutral',
        neutralSummary: 'The article presents factual claims without significant partisan skew.'
      };
    }

    return {
      leftFraming: spectrumData.leftFraming || 'Focuses on systemic impact, progressive policy perspectives, and regulatory considerations.',
      centerGrounding: spectrumData.centerGrounding || 'Agreed consensus facts: primary event chronology, official statements, and undisputed statistics.',
      rightFraming: spectrumData.rightFraming || 'Focuses on fiscal accountability, institutional skepticism, and individual liberty perspectives.',
      dominantLean: spectrumData.dominantLean || 'Neutral / Balanced',
      neutralSummary: spectrumData.neutralSummary || 'Overall coverage can be synthesized into undisputed facts while recognizing divergent ideological interpretations.'
    };
  }

  /**
   * Helper to compute percentages for the UI spectrum visualizer
   */
  static computeBiasRatios(dominantLean) {
    const lean = (dominantLean || '').toLowerCase();
    if (lean.includes('far left') || lean.includes('strong left')) {
      return { left: 65, center: 25, right: 10 };
    }
    if (lean.includes('left')) {
      return { left: 50, center: 35, right: 15 };
    }
    if (lean.includes('far right') || lean.includes('strong right')) {
      return { left: 10, center: 25, right: 65 };
    }
    if (lean.includes('right')) {
      return { left: 15, center: 35, right: 50 };
    }
    // Neutral or Center default
    return { left: 20, center: 60, right: 20 };
  }
}
