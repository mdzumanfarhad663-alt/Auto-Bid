/**
 * Standalone OpenAI Service for Freelancer Proposal Generation
 * Uses gpt-4o-mini to draft personalized, ultra-concise (<150 words) bids.
 */

class OpenAIService {
  constructor(apiKey = process.env.OPENAI_API_KEY, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
    this.apiEndpoint = 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * Generates a tailored proposal under 150 words
   * @param {Object} project - The Freelancer project object
   * @param {Object} options - Custom prompts, skills, portfolio links
   * @returns {Promise<string>} The generated proposal text
   */
  async generateProposal(project, options = {}) {
    const {
      skills = ['React', 'Next.js', 'Node.js', 'WordPress', 'Shopify'],
      portfolioLinks = ['https://github.com/my-profile'],
      ctaQuestion = 'When are you available for a brief 5-minute technical review call?',
      customSystemPrompt = null,
      temperature = 0.65,
    } = options;

    const defaultSystemPrompt = `You are an elite top 1% freelancer submitting a winning bid on Freelancer.com.
Non-negotiable Rules:
1. WORD LIMIT: Strictly under 140 words. Under no circumstances exceed 150 words.
2. NO CLICHÉ INTROS: Never say "Dear client", "I hope you are well", or "I have read your job". Start with a direct technical diagnosis.
3. CONCISE PROBLEM IDENTIFICATION: Show immediate mastery of their technical bottleneck in sentences 1-2.
4. RELEVANT TECH MATCH: Reference these matching proficiencies: ${skills.join(', ')}.
5. PROOF: Include portfolio link: ${portfolioLinks[0] || 'https://github.com/my-portfolio'}.
6. CONVERSATION HOOK: End with this crisp technical question: "${ctaQuestion}".`;

    const systemPrompt = customSystemPrompt || defaultSystemPrompt;

    const userPrompt = `Project Title: ${project.title}
Budget: ${project.budget?.minimum || 0} - ${project.budget?.maximum || 0} ${project.budget?.currency || 'USD'}
Skills Required: ${(project.jobs || []).map((j) => (typeof j === 'string' ? j : j.name)).join(', ')}

Job Description:
"""
${project.description}
"""

Generate the proposal now (under 140 words):`;

    if (!this.apiKey || this.apiKey.startsWith('your_openai')) {
      console.warn('[OpenAIService] OPENAI_API_KEY not set. Using smart template fallback.');
      return this.generateFallbackTemplate(project, skills, portfolioLinks, ctaQuestion);
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: temperature,
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error ${response.status}: ${errBody.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (error) {
      console.error('[OpenAIService] Generation error:', error.message);
      return this.generateFallbackTemplate(project, skills, portfolioLinks, ctaQuestion);
    }
  }

  generateFallbackTemplate(project, skills, portfolioLinks, ctaQuestion) {
    const matchedSkills = skills.slice(0, 3).join(' and ');
    return `I reviewed the requirements for "${project.title}".

With extensive production experience in ${matchedSkills}, I focus on high-performance architecture, clean modular code, and direct communication. I can isolate the root cause and deliver this cleanly within your target deadline.

Selected work samples: ${portfolioLinks[0] || 'https://github.com/my-profile'}

${ctaQuestion}`;
  }
}

// Support both CommonJS and ES module importing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OpenAIService };
}
