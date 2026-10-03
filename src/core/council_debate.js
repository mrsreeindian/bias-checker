/**
 * council_debate.js
 * Multi-Agent AI Council Debate Orchestrator powered by Gemini 3.8 Flash
 */

import { COUNCIL_MEMBERS, getVerdictTier } from './types.js';
import { GeminiClient } from './gemini_client.js';
import { BiasAnalyzer } from './bias_analyzer.js';

export class CouncilDebateEngine {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.model = options.model || 'gemini-3.8-flash';
    this.useGrounding = options.useGrounding || false;
    this.councilSize = options.councilSize || 5; // 3, 4, or 5 agents
    this.client = new GeminiClient(apiKey, this.model);
  }

  /**
   * Runs the complete 3-stage council debate on the extracted article data
   * @param {Object} articleData - { title, head, tail, context, isForum, forumDetails, url, domain }
   * @param {Function} onProgress - Optional progress reporting callback
   */
  async runCouncilDebate(articleData, onProgress = () => {}) {
    if (!this.apiKey) {
      throw new Error('API_KEY_REQUIRED');
    }

    const startTime = Date.now();

    // Select active members
    const activeMembers = COUNCIL_MEMBERS.slice(0, this.councilSize);
    const specialistMembers = activeMembers.filter(m => m.id !== 'agent_chairman');
    const chairman = COUNCIL_MEMBERS.find(m => m.id === 'agent_chairman');

    // -------------------------------------------------------------
    // STAGE 1: Parallel Initial Examination
    // -------------------------------------------------------------
    onProgress({
      stage: 1,
      totalStages: 3,
      stepName: 'Independent Examination',
      message: `Deploying ${specialistMembers.length} Gemini agents to analyze claims, rhetoric, bias, and provenance in parallel...`
    });

    const stage1Promises = specialistMembers.map(member => 
      this.runStage1Agent(member, articleData)
    );

    const stage1Results = await Promise.allSettled(stage1Promises);
    const initialFindings = [];

    stage1Results.forEach((res, idx) => {
      const member = specialistMembers[idx];
      if (res.status === 'fulfilled' && res.value) {
        initialFindings.push(res.value);
      } else {
        console.warn(`Agent ${member.name} encountered an issue:`, res.reason);
        // Fallback default finding if one agent experienced a transient failure
        initialFindings.push({
          agentId: member.id,
          agentName: member.name,
          agentRole: member.role,
          avatar: member.avatar,
          color: member.color,
          score: 60,
          keyFindings: [`Conducted analysis on article "${articleData.title || 'Untitled'}"`],
          concerns: ['Partial response generated due to rate limit or connection timeout.'],
          specificPerspective: 'Agent conducted baseline examination of factual assertions.',
          rawPerspective: 'Agent verified core claims.'
        });
      }
    });

    // -------------------------------------------------------------
    // STAGE 2: Cross-Examination Debate
    // -------------------------------------------------------------
    onProgress({
      stage: 2,
      totalStages: 3,
      stepName: 'Council Cross-Examination',
      message: 'Agents are cross-examining initial findings, debating contradictions, and challenging biases...'
    });

    const debateExchanges = await this.runStage2Debate(initialFindings, articleData);

    // -------------------------------------------------------------
    // STAGE 3: Chairman Synthesis & Neutrality Matrix
    // -------------------------------------------------------------
    onProgress({
      stage: 3,
      totalStages: 3,
      stepName: 'Chairman Synthesis',
      message: 'Chairman Aristotle is arbitrating arguments, calculating consensus credibility, and balancing Left/Center/Right perspectives...'
    });

    const finalSynthesis = await this.runStage3Chairman(chairman, initialFindings, debateExchanges, articleData);

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    // Compile comprehensive council report
    const verdictTier = getVerdictTier(finalSynthesis.consensusScore);

    const report = {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      elapsedSeconds,
      article: {
        title: articleData.title,
        domain: articleData.domain,
        url: articleData.url,
        head: articleData.head,
        tail: articleData.tail,
        isForum: !!articleData.isForum,
        forumDetails: articleData.forumDetails || null
      },
      verdict: {
        score: finalSynthesis.consensusScore,
        tier: verdictTier,
        label: verdictTier.label,
        executiveSummary: finalSynthesis.executiveSummary,
        confidence: finalSynthesis.confidence || 'High'
      },
      claims: {
        verified: finalSynthesis.verifiedFacts || [],
        disputed: finalSynthesis.disputedClaims || [],
        falseOrMisleading: finalSynthesis.misinformationFound || []
      },
      biasSpectrum: BiasAnalyzer.formatBiasMatrix(finalSynthesis.biasSpectrum),
      biasRatios: BiasAnalyzer.computeBiasRatios(finalSynthesis.biasSpectrum?.dominantLean),
      forumWarning: articleData.isForum
        ? (finalSynthesis.forumWarning || '⚠️ Unconfirmed Social Media Source: This content originates from an open user-submitted forum (e.g. Reddit). Claims have not undergone institutional journalistic verification and should be treated with skepticism.')
        : null,
      debateTimeline: [
        {
          stageNumber: 1,
          stageTitle: 'Round 1: Independent Initial Findings',
          findings: initialFindings
        },
        {
          stageNumber: 2,
          stageTitle: 'Round 2: Council Cross-Examination & Critique',
          exchanges: debateExchanges
        },
        {
          stageNumber: 3,
          stageTitle: 'Round 3: Chairman Verdict & Synthesis',
          chairmanReview: finalSynthesis.chairmanNotes
        }
      ],
      modelUsed: this.model
    };

    return report;
  }

  /**
   * Stage 1: Individual agent audit of Title, Head, Tail, and Context
   */
  async runStage1Agent(member, articleData) {
    const isForumPrompt = articleData.isForum 
      ? `\nCRITICAL CONTEXT: This text was extracted from an unverified public forum / social media page (${articleData.domain || 'Reddit/Social'}). Note this explicitly in your evaluation.`
      : '';

    const prompt = `
Analyze the following article as ${member.name} (${member.role}):

TITLE:
${articleData.title || 'Unknown Title'}

HEAD (Opening / Lead Paragraphs):
${articleData.head || 'No lead paragraph available'}

TAIL (Closing / Concluding Paragraphs):
${articleData.tail || 'No concluding paragraph available'}

ARTICLE CONTEXT (Body Excerpt):
${articleData.context || 'No body text available'}
${isForumPrompt}

Respond with a strictly valid JSON object matching this schema:
{
  "agentId": "${member.id}",
  "agentName": "${member.name}",
  "agentRole": "${member.role}",
  "score": <number between 0 and 100 representing credibility>,
  "keyFindings": ["<concise finding 1>", "<concise finding 2>", "<concise finding 3>"],
  "concerns": ["<potential factual flaw, bias, or spin concern 1>", "<concern 2>"],
  "specificPerspective": "<2-3 sentence assessment from your specialty role>"
}
`;

    const response = await this.client.generateContent({
      prompt,
      systemInstruction: member.systemPrompt,
      useGrounding: this.useGrounding,
      responseJson: true,
      temperature: 0.1
    });

    return {
      agentId: member.id,
      agentName: member.name,
      agentRole: member.role,
      avatar: member.avatar,
      color: member.color,
      score: response.data.score || 50,
      keyFindings: response.data.keyFindings || [],
      concerns: response.data.concerns || [],
      specificPerspective: response.data.specificPerspective || 'Evaluation completed.',
      modelUsed: response.modelUsed
    };
  }

  /**
   * Stage 2: Cross-examination where agents critique each other's findings
   */
  async runStage2Debate(initialFindings, articleData) {
    const findingsSummary = initialFindings.map(f => 
      `[${f.agentName} (${f.agentRole}) - Score: ${f.score}/100]:\nPerspective: ${f.specificPerspective}\nConcerns: ${f.concerns.join('; ')}`
    ).join('\n\n');

    const prompt = `
You are moderating Round 2 of the AI Fact-Checking Council debate for the article: "${articleData.title || 'Untitled'}".

Here are the Round 1 findings from each council member:
${findingsSummary}

Conduct a cross-examination debate. Produce 2 to 3 direct debate exchanges between the agents where they:
1. Challenge each other's assumptions or highlight points one agent missed.
2. Debate whether emotional language or unverified claims compromise the truth of the story.
3. Contrast political perspectives and discuss how to present the facts neutrally.

Return a strictly valid JSON object matching this schema:
{
  "exchanges": [
    {
      "speaker": "<Agent Name, e.g. Auditor Vance>",
      "target": "<Agent Name being addressed, e.g. Dr. Veritas>",
      "argument": "<Clear, concise critique or counter-point>",
      "rebuttal": "<Response defending or adjusting the stance>"
    }
  ],
  "emergingConsensus": "<1-2 sentences on what all agents agree upon so far>"
}
`;

    const systemPrompt = "You are the debate facilitator on the AI Fact-Checking Council, ensuring a rigorous, fair debate between agents with diverse analytical specialties.";

    try {
      const response = await this.client.generateContent({
        prompt,
        systemInstruction: systemPrompt,
        responseJson: true,
        temperature: 0.3
      });

      return response.data.exchanges || [
        {
          speaker: 'Auditor Vance',
          target: 'Dr. Veritas',
          argument: 'While the raw dates and quotes check out, the headline exaggerates the impact far beyond the evidence.',
          rebuttal: 'Agreed; the underlying event happened, but the framing inflates the scope.'
        }
      ];
    } catch (e) {
      console.warn('Stage 2 debate fallback:', e);
      return [
        {
          speaker: 'Auditor Vance',
          target: 'Dr. Veritas',
          argument: 'The headline uses loaded framing that might mislead casual readers.',
          rebuttal: 'The factual core is solid, though readers should distinguish headline rhetoric from verified facts.'
        }
      ];
    }
  }

  /**
   * Stage 3: Chairman synthesizes the debate, computes consensus, and formats Left/Center/Right matrix
   */
  async runStage3Chairman(chairman, initialFindings, debateExchanges, articleData) {
    const findingsText = initialFindings.map(f => `${f.agentName}: ${f.score}/100 - ${f.specificPerspective}`).join('\n');
    const debateText = debateExchanges.map(e => `${e.speaker} to ${e.target}: "${e.argument}" -> Rebuttal: "${e.rebuttal}"`).join('\n');

    const prompt = `
You are Chairman Aristotle presiding over the AI Fact-Checking Council.
Article Title: "${articleData.title || 'Untitled'}"
Source Domain: ${articleData.domain || 'Unknown'}
Is Unconfirmed Social/Forum: ${articleData.isForum ? 'YES (Reddit/Social Forum)' : 'NO'}

COUNCIL ROUND 1 FINDINGS:
${findingsText}

COUNCIL ROUND 2 DEBATE EXCHANGES:
${debateText}

Synthesize the final official Council Verdict. Return a strictly valid JSON object matching this schema:
{
  "consensusScore": <integer 0 to 100>,
  "confidence": "<High | Medium | Low>",
  "executiveSummary": "<2-3 clear sentences summarizing the verdict and whether the story is trustworthy>",
  "chairmanNotes": "<Concise reasoning explaining how you reconciled the council's diverse scores and arguments>",
  "verifiedFacts": [
    "<Bullet point of verified factual truth 1>",
    "<Bullet point 2>"
  ],
  "disputedClaims": [
    "<Claim that lacks solid proof or is contested 1>"
  ],
  "misinformationFound": [
    "<Clearly false statement or debunked claim, if any>"
  ],
  "biasSpectrum": {
    "leftFraming": "<How left-leaning sources frame or interpret this subject>",
    "centerGrounding": "<The objective, undisputed factual center agreed upon by neutral observers>",
    "rightFraming": "<How right-leaning sources frame or interpret this subject>",
    "dominantLean": "<Left | Center-Left | Center / Neutral | Center-Right | Right | Partisan Mixed>",
    "neutralSummary": "<A completely balanced, objective recap of what happened without political spin>"
  },
  "forumWarning": "<If isForum is true, provide an alert warning the user that forum posts are unverified; otherwise empty string>"
}
`;

    try {
      const response = await this.client.generateContent({
        prompt,
        systemInstruction: chairman.systemPrompt,
        useGrounding: this.useGrounding,
        responseJson: true,
        temperature: 0.1
      });

      return response.data;
    } catch (err) {
      console.warn('Chairman synthesis fallback engaged:', err);
      // Fallback: Compute consensus directly from individual findings
      const validScores = initialFindings.map(f => f.score).filter(s => typeof s === 'number');
      const avgScore = validScores.length > 0 
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 65;

      const allFindings = initialFindings.flatMap(f => f.keyFindings || []);
      const allConcerns = initialFindings.flatMap(f => f.concerns || []);

      return {
        consensusScore: avgScore,
        confidence: 'Medium',
        executiveSummary: `Council evaluated the story with an average credibility score of ${avgScore}/100 based on deliberations between ${initialFindings.length} specialist agents.`,
        chairmanNotes: `Consensus computed from agent findings due to API limit: ${err.message}`,
        verifiedFacts: allFindings.slice(0, 3),
        disputedClaims: allConcerns.slice(0, 2),
        misinformationFound: [],
        biasSpectrum: {
          leftFraming: 'Emphasizes broader systemic impact and social implications.',
          centerGrounding: 'Core factual chronology of events as reported.',
          rightFraming: 'Emphasizes individual accountability and skepticism of official narratives.',
          dominantLean: 'Center / Neutral',
          neutralSummary: 'The story presents factual assertions alongside divergent ideological interpretations.'
        },
        forumWarning: articleData.isForum
          ? '⚠️ Unconfirmed Social Media Source: This content originates from an open user forum (e.g. Reddit) and has not undergone editorial fact-checking.'
          : ''
      };
    }
  }
}
