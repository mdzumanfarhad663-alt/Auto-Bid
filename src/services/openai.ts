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
  useAiPricingAndDays?: boolean;
}

export interface ProposalGenerationResult {
  proposal: string;
  modelUsed: string;
  wordCount: number;
  tokensUsed?: number;
  recommendedBidAmount?: number;
  recommendedDeliveryDays?: number;
  pricingReasoning?: string;
}

export async function generateProposal(params: GenerateProposalParams): Promise<ProposalGenerationResult> {
  const apiKey = params.customApiKey || process.env.OPENAI_API_KEY;
  const modelName = params.model || 'gpt-4o-mini';
  const useAiPricing = params.useAiPricingAndDays !== false;

  const defaultSystemPrompt = `You are an elite top 1% full-stack freelancer submitting a winning bid proposal on Freelancer.com.
Follow these non-negotiable rules:
1. WORD COUNT: Under 140 words. Absolute maximum 150 words.
2. NO CLICHÉ GREETINGS: Do NOT say "Dear Hiring Manager", "I hope this finds you well", or "I am thrilled to apply". Start immediately with a sharp, direct observation regarding their technical problem.
3. CONCISE PROBLEM IDENTIFICATION: Show you read their exact specs in the first 2 sentences.
4. RELEVANT TECH STACK: Mention only the exact tools matching their job: ${params.mySkills.join(', ')}.
5. PORTFOLIO PROOF: Naturally include relevant portfolio proof: ${params.portfolioLinks.slice(0, 2).join(' | ')}.
6. TECHNICAL CTA: Conclude with a single, sharp technical question to initiate conversation: "${params.ctaQuestion || 'When are you available for a brief 5-minute technical alignment chat?'}"
7. TONE: Confident, crisp, authoritative, engineering-focused. No fluff.`;

  const baseInstruction = params.customSystemPrompt && params.customSystemPrompt.trim() !== ''
    ? params.customSystemPrompt
        .replace('{skills}', params.mySkills.join(', '))
        .replace('{portfolio_links}', params.portfolioLinks.join(', '))
        .replace('{cta_question}', params.ctaQuestion)
    : defaultSystemPrompt;

  const systemInstruction = useAiPricing
    ? `${baseInstruction}

ADDITIONAL RULE FOR BID PRICING & TIMELINE:
You must also analyze the project scope, technical complexity, and deliverables against the client's budget of ${params.budget.minimum} - ${params.budget.maximum} ${params.budget.currency}.
Select the most competitive, optimal Bid Amount (STRICTLY between ${params.budget.minimum} and ${params.budget.maximum}) and realistic Delivery Days (e.g. 1-14 days).
You MUST respond with valid JSON in this exact structure:
{
  "proposal": "<your winning proposal under 140 words>",
  "recommendedBidAmount": <number between ${params.budget.minimum} and ${params.budget.maximum}>,
  "recommendedDeliveryDays": <integer delivery days>,
  "pricingReasoning": "<1 sentence explaining why this price & timeframe is optimal>"
}`
    : baseInstruction;

  const userPrompt = `Project Title: ${params.projectTitle}
Budget: ${params.budget.minimum} - ${params.budget.maximum} ${params.budget.currency}
Required Skills: ${params.skills.join(', ')}
${params.clientCountry ? `Client Location: ${params.clientCountry}` : ''}

Project Details:
"""
${params.projectDescription}
"""

${useAiPricing ? 'Generate the JSON object with proposal, recommendedBidAmount, recommendedDeliveryDays, and pricingReasoning now:' : 'Generate the winning proposal now (under 150 words, high impact):'}`;

  // Default fallback bid amount & days based on budget heuristics
  const defaultAmount = Math.max(
    params.budget.minimum,
    Math.round(params.budget.maximum * 0.85)
  );
  const defaultDays = 4;

  // 1. If OpenAI API key is configured, call OpenAI directly
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
          max_tokens: 500,
          response_format: useAiPricing ? { type: 'json_object' } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content?.trim() || '';

      if (useAiPricing) {
        try {
          const parsed = JSON.parse(rawText);
          const proposal = parsed.proposal || rawText;
          let bidAmount = Number(parsed.recommendedBidAmount);
          let deliveryDays = parseInt(parsed.recommendedDeliveryDays, 10);

          if (isNaN(bidAmount) || bidAmount < params.budget.minimum || bidAmount > params.budget.maximum) {
            bidAmount = defaultAmount;
          }
          if (isNaN(deliveryDays) || deliveryDays < 1) {
            deliveryDays = defaultDays;
          }

          return {
            proposal,
            modelUsed: modelName,
            wordCount: proposal.split(/\s+/).filter(Boolean).length,
            tokensUsed: data.usage?.total_tokens,
            recommendedBidAmount: Math.round(bidAmount),
            recommendedDeliveryDays: deliveryDays,
            pricingReasoning: parsed.pricingReasoning || `AI-selected optimal price within ${params.budget.currency} ${params.budget.minimum}-${params.budget.maximum}`,
          };
        } catch (jsonErr) {
          // If JSON parse failed, clean and use rawText
        }
      }

      const words = rawText.split(/\s+/).filter(Boolean).length;
      return {
        proposal: rawText,
        modelUsed: modelName,
        wordCount: words,
        tokensUsed: data.usage?.total_tokens,
        recommendedBidAmount: defaultAmount,
        recommendedDeliveryDays: defaultDays,
      };
    } catch (err: any) {
      console.warn('OpenAI API call failed, falling back to backup generator if available:', err.message);
      // Fall through to Gemini or template fallback
    }
  }

  // 2. Fallback to Gemini if GEMINI_API_KEY is available
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemInstruction}\n\n${userPrompt}`,
      });

      const rawText = geminiResponse.text?.trim() || '';
      if (useAiPricing) {
        try {
          const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          const proposal = parsed.proposal || rawText;
          let bidAmount = Number(parsed.recommendedBidAmount);
          let deliveryDays = parseInt(parsed.recommendedDeliveryDays, 10);

          if (isNaN(bidAmount) || bidAmount < params.budget.minimum || bidAmount > params.budget.maximum) {
            bidAmount = defaultAmount;
          }
          if (isNaN(deliveryDays) || deliveryDays < 1) {
            deliveryDays = defaultDays;
          }

          return {
            proposal,
            modelUsed: 'gemini-2.5-flash (OpenAI fallback)',
            wordCount: proposal.split(/\s+/).filter(Boolean).length,
            recommendedBidAmount: Math.round(bidAmount),
            recommendedDeliveryDays: deliveryDays,
            pricingReasoning: parsed.pricingReasoning || 'AI scope & budget optimization',
          };
        } catch (e) {}
      }

      return {
        proposal: rawText,
        modelUsed: 'gemini-2.5-flash (OpenAI fallback)',
        wordCount: rawText.split(/\s+/).filter(Boolean).length,
        recommendedBidAmount: defaultAmount,
        recommendedDeliveryDays: defaultDays,
      };
    } catch (gErr: any) {
      console.warn('Gemini fallback also unavailable:', gErr.message);
    }
  }

  // 3. Robust template-based fallback
  const techKeywords = params.skills.slice(0, 3).join(' and ');
  const fallbackProposal = `Hi, I analyzed your project requirements for "${params.projectTitle}". 

Having architected multiple production applications with ${techKeywords || params.mySkills.slice(0, 3).join(', ')}, I can deliver a clean, performant, and fully documented solution tailored to your timeline.

I focus strictly on clean code architecture, rapid delivery, and transparent daily updates. Check out relevant project benchmarks here: ${params.portfolioLinks[0] || 'https://github.com/my-portfolio'}.

${params.ctaQuestion || 'Could you share the repository or wireframes so I can prepare an exact technical breakdown?'}`;

  return {
    proposal: fallbackProposal,
    modelUsed: 'deterministic-template-engine (Configure OPENAI_API_KEY in Settings)',
    wordCount: fallbackProposal.split(/\s+/).filter(Boolean).length,
    recommendedBidAmount: defaultAmount,
    recommendedDeliveryDays: defaultDays,
  };
}
