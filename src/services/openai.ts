/**
 * OpenAI Service for Freelancer Proposal Generation
 * Uses gpt-4o-mini to draft high-converting, concise (<150 words) proposals.
 */

import { GoogleGenAI } from '@google/genai';

export interface GenerateProposalParams {
  projectTitle: string;
  projectDescription: string;
  skills: string[];
  budget: {
    minimum: number;
    maximum: number;
    currency: string;
  };
  clientCountry?: string;
  mySkills: string[];
  portfolioLinks: string[];
  ctaQuestion: string;
  customSystemPrompt?: string;
  customApiKey?: string;
  model?: string;
}

export async function generateProposal(params: GenerateProposalParams): Promise<{
  proposal: string;
  modelUsed: string;
  wordCount: number;
  tokensUsed?: number;
}> {
  const apiKey = params.customApiKey || process.env.OPENAI_API_KEY;
  const modelName = params.model || 'gpt-4o-mini';

  const defaultSystemPrompt = `You are an elite top 1% full-stack freelancer submitting a winning bid proposal on Freelancer.com.
Follow these non-negotiable rules:
1. WORD COUNT: Under 140 words. Absolute maximum 150 words.
2. NO CLICHÉ GREETINGS: Do NOT say "Dear Hiring Manager", "I hope this finds you well", or "I am thrilled to apply". Start immediately with a sharp, direct observation regarding their technical problem.
3. CONCISE PROBLEM IDENTIFICATION: Show you read their exact specs in the first 2 sentences.
4. RELEVANT TECH STACK: Mention only the exact tools matching their job: ${params.mySkills.join(', ')}.
5. PORTFOLIO PROOF: Naturally include relevant portfolio proof: ${params.portfolioLinks.slice(0, 2).join(' | ')}.
6. TECHNICAL CTA: Conclude with a single, sharp technical question to initiate conversation: "${params.ctaQuestion || 'When are you available for a brief 5-minute technical alignment chat?'}"
7. TONE: Confident, crisp, authoritative, engineering-focused. No fluff.`;

  const systemInstruction = params.customSystemPrompt && params.customSystemPrompt.trim() !== ''
    ? params.customSystemPrompt
        .replace('{skills}', params.mySkills.join(', '))
        .replace('{portfolio_links}', params.portfolioLinks.join(', '))
        .replace('{cta_question}', params.ctaQuestion)
    : defaultSystemPrompt;

  const userPrompt = `Project Title: ${params.projectTitle}
Budget: ${params.budget.minimum} - ${params.budget.maximum} ${params.budget.currency}
Required Skills: ${params.skills.join(', ')}
${params.clientCountry ? `Client Location: ${params.clientCountry}` : ''}

Project Details:
"""
${params.projectDescription}
"""

Generate the winning proposal now (under 150 words, high impact):`;

  // 1. If OpenAI API key is configured, call OpenAI directly via fetch
  if (apiKey && apiKey.trim() !== '' && !apiKey.startsWith('your_openai')) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.65,
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const proposal = data.choices?.[0]?.message?.content?.trim() || '';
      const words = proposal.split(/\s+/).filter(Boolean).length;

      return {
        proposal,
        modelUsed: modelName,
        wordCount: words,
        tokensUsed: data.usage?.total_tokens,
      };
    } catch (err: any) {
      console.warn('OpenAI API call failed, falling back to backup generator if available:', err.message);
      // Fall through to Gemini or rule-based fallback
    }
  }

  // 2. Fallback to Gemini if GEMINI_API_KEY is available in AI Studio environment
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemInstruction}\n\n${userPrompt}`,
      });

      const proposal = geminiResponse.text?.trim() || '';
      const words = proposal.split(/\s+/).filter(Boolean).length;

      return {
        proposal,
        modelUsed: 'gemini-2.5-flash (OpenAI gpt-4o-mini fallback)',
        wordCount: words,
      };
    } catch (gErr: any) {
      console.warn('Gemini fallback also unavailable:', gErr.message);
    }
  }

  // 3. Robust template-based fallback when keys are pending configuration
  const techKeywords = params.skills.slice(0, 3).join(' and ');
  const fallbackProposal = `Hi, I analyzed your project requirements for "${params.projectTitle}". 

Having architected multiple production applications with ${techKeywords || params.mySkills.slice(0, 3).join(', ')}, I can deliver a clean, performant, and fully documented solution tailored to your timeline.

I focus strictly on clean code architecture, rapid delivery, and transparent daily updates. Check out relevant project benchmarks here: ${params.portfolioLinks[0] || 'https://github.com/my-portfolio'}.

${params.ctaQuestion || 'Could you share the repository or wireframes so I can prepare an exact technical breakdown?'}`;

  return {
    proposal: fallbackProposal,
    modelUsed: 'deterministic-template-engine (Configure OPENAI_API_KEY for live gpt-4o-mini)',
    wordCount: fallbackProposal.split(/\s+/).filter(Boolean).length,
  };
}
