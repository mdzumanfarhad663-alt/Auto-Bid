/**
 * OpenAI Service for Freelancer Proposal Generation
 * Uses OpenAI models (gpt-4o-mini, gpt-4o, etc.) to draft high-converting,
 * concise (<140 words) proposals following strict custom Markdown rules.
 * 
 * NOTE: Template fallback has been completely removed.
 * Proposals are generated exclusively via OpenAI API using the user's custom markdown rules.
 */

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
  clientName?: string;
  mySkills: string[];
  portfolioLinks: string[];
  ctaQuestion?: string;
  customSystemPrompt?: string;
  customApiKey?: string;
  model?: string;
  useAiPricingAndDays?: boolean;
}

export interface ProposalGenerationResult {
  proposal: string;
  proposalSource: 'openai';
  modelUsed: string;
  wordCount: number;
  tokensUsed?: number;
  recommendedBidAmount?: number;
  recommendedDeliveryDays?: number;
  pricingReasoning?: string;
  ctaQuestion?: string;
  errorMessage?: string;
}

export const DEFAULT_PROPOSAL_RULES = `OUTPUT FORMAT (follow exactly):

Line 1: "Hi"
[blank line]
Paragraph 1 (1–2 sentences): Restate the client's exact problem or goal using details from the job post, then say clearly that I can fix/build it. Do not start with "I".
[blank line]
Paragraph 2 (2–3 sentences): Proof. Mention a similar project I've done using {skills}, with one specific result or detail. Keep it believable and concrete.
[blank line]
Paragraph 3 (1–2 sentences): My quick plan — how I would approach this job in simple steps written as a sentence.
[blank line]
Let's discuss in chat.

HARD RULES:
- The first word of the proposal must always be "Hi". No exceptions.
- Put exactly one blank line between every section.
- Total length under 140 words.
- Plain text only. No bullet points, no bold, no emojis, no headings, no signature, no name at the end.
- Write like a real person typing a message: short sentences, simple English, confident tone.
- Never use these phrases: "I came across your project", "I am excited", "I am the perfect fit", "Dear Sir", "I have read your job description", "look no further", "seamless", "leverage", "delve".
- Do not repeat the job post back word for word.
- Do not invent fake client names, fake links, or fake numbers.
- Output only the proposal text, nothing before or after it.`;

function cleanProposalText(text: string): string {
  if (!text) return '';
  return text.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
}

export async function generateProposal(params: GenerateProposalParams): Promise<ProposalGenerationResult> {
  const apiKey = params.customApiKey || process.env.OPENAI_API_KEY;
  const modelName = params.model || 'gpt-4o-mini';
  const useAiPricing = params.useAiPricingAndDays !== false;

  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('your_openai')) {
    throw new Error(
      'OpenAI API Key is required. Please add your OpenAI API Key in Settings or the AI Prompt Editor to generate proposals following your custom markdown rules.'
    );
  }

  const promptTemplate = params.customSystemPrompt && params.customSystemPrompt.trim() !== ''
    ? params.customSystemPrompt
    : DEFAULT_PROPOSAL_RULES;

  // Replace placeholders in the custom rules / system prompt if present
  let baseInstruction = promptTemplate
    .replace(/\{client_name\}/g, params.clientName || '')
    .replace(/\{skills\}/g, params.mySkills.slice(0, 4).join(', '))
    .replace(/\{portfolio_links\}/g, params.portfolioLinks.slice(0, 2).join(' | '));

  if (baseInstruction.includes('{cta_question}')) {
    const cta = params.ctaQuestion && params.ctaQuestion.trim() !== '' 
      ? params.ctaQuestion 
      : "Let's discuss in chat.";
    baseInstruction = baseInstruction.replace(/\{cta_question\}/g, cta);
  }

  const systemInstruction = `${baseInstruction}

${useAiPricing ? `
ADDITIONAL JSON RESPONSE REQUIREMENT:
Evaluate the project requirements against the client's budget of ${params.budget.minimum} - ${params.budget.maximum} ${params.budget.currency}.
Select the most competitive Bid Amount (between ${params.budget.minimum} and ${params.budget.maximum} ${params.budget.currency}) and realistic Delivery Days (1-14).
You MUST respond in valid JSON format:
{
  "proposal": "<your proposal adhering strictly to all the output format instructions and hard rules defined above>",
  "recommendedBidAmount": <number between ${params.budget.minimum} and ${params.budget.maximum}>,
  "recommendedDeliveryDays": <integer between 1 and 14>,
  "pricingReasoning": "<1 concise sentence explaining the price and timeframe>"
}` : ''}`;

  const userPrompt = `Project Title: ${params.projectTitle}
Budget: ${params.budget.minimum} - ${params.budget.maximum} ${params.budget.currency}
Skills: ${params.skills.join(', ')}
${params.clientCountry ? `Client Location: ${params.clientCountry}` : ''}

Job Description:
"""
${params.projectDescription}
"""

${useAiPricing ? 'Generate the JSON object now following the prompt rules strictly:' : 'Generate the proposal now adhering strictly to the markdown rules:'}`;

  const defaultAmount = Math.max(
    params.budget.minimum,
    Math.round(params.budget.maximum * 0.85)
  );
  const defaultDays = 4;

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
      max_tokens: 600,
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
      const proposal = cleanProposalText(parsed.proposal || rawText);
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
        proposalSource: 'openai',
        modelUsed: modelName,
        wordCount: proposal.split(/\s+/).filter(Boolean).length,
        tokensUsed: data.usage?.total_tokens,
        recommendedBidAmount: Math.round(bidAmount),
        recommendedDeliveryDays: deliveryDays,
        pricingReasoning: parsed.pricingReasoning || `AI-selected optimal price within ${params.budget.currency} ${params.budget.minimum}-${params.budget.maximum}`,
        ctaQuestion: parsed.ctaQuestion,
      };
    } catch (jsonErr) {
      // Fall through to plain text handling if JSON parsing fails
    }
  }

  const proposal = cleanProposalText(rawText);
  const words = proposal.split(/\s+/).filter(Boolean).length;
  return {
    proposal,
    proposalSource: 'openai',
    modelUsed: modelName,
    wordCount: words,
    tokensUsed: data.usage?.total_tokens,
    recommendedBidAmount: defaultAmount,
    recommendedDeliveryDays: defaultDays,
  };
}
