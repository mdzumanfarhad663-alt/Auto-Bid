/**
 * OpenAI Service for Freelancer Proposal Generation
 * Uses OpenAI models (gpt-4o-mini, gpt-4o, o3-mini, etc.) to draft high-converting,
 * concise (<140 words) proposals following strict Markdown rules.
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
  proposalSource: 'openai' | 'gemini' | 'template';
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

Line 1: "Hi {client_name}," — if client name is empty, write only "Hi,"
[blank line]
Paragraph 1 (1–2 sentences): Restate the client's exact problem or goal using details from the job post, then say clearly that I can fix/build it. Do not start with "I".
[blank line]
Paragraph 2 (2–3 sentences): Proof. Mention a similar project I've done using {skills}, with one specific result or detail. Keep it believable and concrete.
[blank line]
Paragraph 3 (1–2 sentences): My quick plan — how I would approach this job in simple steps written as a sentence.
[blank line]
Last line: {cta_question}

HARD RULES:
- The first word of the proposal must always be "Hi". No exceptions.
- Put exactly one blank line between every section.
- Total length under 140 words.
- Plain text only. No bullet points, no bold, no emojis, no headings, no signature, no name at the end.
- CRITICAL CLOSING QUESTION RULE: The last line MUST be 1 single, insightful technical question based DIRECTLY on the client's problem, requirements, or tech stack described in the job post (e.g. asking about their existing API version, database schema, design files, or specific challenge). Strictly FORBIDDEN to ask generic questions like "Are you available for a quick call?", "When can we discuss this?", or "Are you available for a 5-minute review call?".
- Write like a real person typing a message: short sentences, simple English, confident tone.
- Never use these phrases: "I came across your project", "I am excited", "I am the perfect fit", "Dear Sir", "I have read your job description", "look no further", "seamless", "leverage", "delve".
- Do not repeat the job post back word for word.
- Do not invent fake client names, fake links, or fake numbers.
- Output only the proposal text, nothing before or after it.`;

export async function generateProposal(params: GenerateProposalParams): Promise<ProposalGenerationResult> {
  const apiKey = params.customApiKey || process.env.OPENAI_API_KEY;
  const modelName = params.model || 'gpt-4o-mini';
  const useAiPricing = params.useAiPricingAndDays !== false;

  // Clean client name if available (avoid usernames like user_128938)
  let cleanClientName = '';
  if (params.clientName && params.clientName.trim()) {
    const raw = params.clientName.trim();
    if (!/^\d+$/.test(raw) && !/^user[_\d]/i.test(raw)) {
      cleanClientName = raw.charAt(0).toUpperCase() + raw.slice(1);
    }
  }

  const promptTemplate = params.customSystemPrompt && params.customSystemPrompt.trim() !== ''
    ? params.customSystemPrompt
    : DEFAULT_PROPOSAL_RULES;

  // Replace placeholders in the custom rules / system prompt
  let baseInstruction = promptTemplate
    .replace(/\{client_name\}/g, cleanClientName)
    .replace(/\{skills\}/g, params.mySkills.slice(0, 4).join(', '))
    .replace(/\{portfolio_links\}/g, params.portfolioLinks.slice(0, 2).join(' | '));

  // Determine if a custom fixed CTA is provided or if dynamic AI question generation should be enforced
  const isGenericOrEmptyCta = !params.ctaQuestion || 
    params.ctaQuestion.trim() === '' || 
    params.ctaQuestion.toLowerCase().includes('5-minute technical review') ||
    params.ctaQuestion.toLowerCase().includes('quick call') ||
    params.ctaQuestion.toLowerCase().includes('available for a quick');

  const ctaInstruction = isGenericOrEmptyCta
    ? `CRITICAL CLOSING QUESTION RULE: The last line MUST be 1 single, insightful technical question derived DIRECTLY from the client's specific problem, features, or technologies described in the job post (e.g. asking about their existing API version, database schema, design files, or specific feature requirements). NEVER use a generic sentence like "Are you available for a quick call?" or "Are you available for a 5-minute review call?".`
    : `Use this closing question or a tailored variation derived from it: "${params.ctaQuestion}"`;

  baseInstruction = baseInstruction.replace(
    /\{cta_question\}/g,
    isGenericOrEmptyCta
      ? `[A single, smart, highly relevant technical question derived directly from the job description and client requirements]`
      : params.ctaQuestion!
  );

  const systemInstruction = `${baseInstruction}

INSTRUCTIONS FOR CLIENT NAME:
- If client name is "${cleanClientName}" and not empty, the first line MUST be: "Hi ${cleanClientName},"
- If client name is empty or unknown, the first line MUST be: "Hi,"

INSTRUCTIONS FOR CLOSING QUESTION:
- ${ctaInstruction}

${useAiPricing ? `
ADDITIONAL RULE FOR BID PRICING & TIMELINE:
You must also evaluate the project scope, technical requirements, and deliverables against the client's budget of ${params.budget.minimum} - ${params.budget.maximum} ${params.budget.currency}.
Select the most competitive, winning Bid Amount (STRICTLY between ${params.budget.minimum} and ${params.budget.maximum} ${params.budget.currency}) and realistic Delivery Days (e.g., 1-14 days).
You MUST respond with valid JSON in this exact structure:
{
  "proposal": "<your winning proposal under 140 words strictly following the 4 paragraphs and hard rules with the project-specific technical question as the last line>",
  "recommendedBidAmount": <number between ${params.budget.minimum} and ${params.budget.maximum}>,
  "recommendedDeliveryDays": <integer delivery days between 1 and 14>,
  "pricingReasoning": "<1 concise sentence explaining the optimal bid amount and timeframe>",
  "ctaQuestion": "<the project-specific question you generated for the last line based on the job details>"
}` : ''}`;

  const userPrompt = `Project Title: ${params.projectTitle}
Budget: ${params.budget.minimum} - ${params.budget.maximum} ${params.budget.currency}
Skills: ${params.skills.join(', ')}
${params.clientCountry ? `Client Location: ${params.clientCountry}` : ''}
${cleanClientName ? `Client Name: ${cleanClientName}` : ''}

Job Description:
"""
${params.projectDescription}
"""

${useAiPricing ? 'Generate the JSON object now:' : 'Generate the winning proposal now (under 140 words, follow output format strictly):'}`;

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
            proposal: proposal.trim(),
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
          // If JSON parse failed, use text
        }
      }

      const words = rawText.split(/\s+/).filter(Boolean).length;
      return {
        proposal: rawText.trim(),
        proposalSource: 'openai',
        modelUsed: modelName,
        wordCount: words,
        tokensUsed: data.usage?.total_tokens,
        recommendedBidAmount: defaultAmount,
        recommendedDeliveryDays: defaultDays,
      };
    } catch (err: any) {
      console.warn('OpenAI API call failed:', err.message);
      // Fall through to Gemini or template fallback with error logged
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
            proposal: proposal.trim(),
            proposalSource: 'gemini',
            modelUsed: 'gemini-2.5-flash (OpenAI Fallback)',
            wordCount: proposal.split(/\s+/).filter(Boolean).length,
            recommendedBidAmount: Math.round(bidAmount),
            recommendedDeliveryDays: deliveryDays,
            pricingReasoning: parsed.pricingReasoning || 'AI scope & budget optimization',
            ctaQuestion: parsed.ctaQuestion,
          };
        } catch (e) {}
      }

      return {
        proposal: rawText.trim(),
        proposalSource: 'gemini',
        modelUsed: 'gemini-2.5-flash (OpenAI Fallback)',
        wordCount: rawText.split(/\s+/).filter(Boolean).length,
        recommendedBidAmount: defaultAmount,
        recommendedDeliveryDays: defaultDays,
      };
    } catch (gErr: any) {
      console.warn('Gemini fallback also unavailable:', gErr.message);
    }
  }

  // 3. Deterministic template fallback strictly following the 4 paragraphs & hard rules format
  const greeting = cleanClientName ? `Hi ${cleanClientName},` : `Hi,`;
  const primarySkill = params.skills[0] || params.mySkills[0] || 'web development';
  const relatedSkills = params.mySkills.slice(0, 3).join(', ');
  
  // Dynamically tailor closing question based on project context
  let cta = params.ctaQuestion;
  if (isGenericOrEmptyCta) {
    const titleLower = (params.projectTitle || '').toLowerCase();
    const descLower = (params.projectDescription || '').toLowerCase();
    if (titleLower.includes('wordpress') || descLower.includes('wordpress') || titleLower.includes('woocommerce')) {
      cta = `Are you currently using any specific caching plugin or theme on this WordPress setup?`;
    } else if (titleLower.includes('react') || titleLower.includes('next') || descLower.includes('react')) {
      cta = `Which state management or UI library are you currently using for this React project?`;
    } else if (titleLower.includes('api') || descLower.includes('api') || titleLower.includes('backend')) {
      cta = `Do you already have the API specifications or documentation ready to connect with?`;
    } else if (titleLower.includes('shopify') || descLower.includes('shopify')) {
      cta = `Is your store using an Online Store 2.0 liquid theme or a custom headless setup?`;
    } else if (titleLower.includes('design') || titleLower.includes('figma') || descLower.includes('figma')) {
      cta = `Do you have the Figma designs and asset exports ready to begin implementation?`;
    } else if (titleLower.includes('python') || titleLower.includes('scrap') || descLower.includes('scrap')) {
      cta = `What target output format (CSV, JSON, or direct database table) do you prefer?`;
    } else if (params.skills.length > 0) {
      cta = `Do you have the technical specifications and repository access ready for the ${params.skills[0]} setup?`;
    } else {
      cta = `Do you have the detailed feature checklist or wireframes ready for this?`;
    }
  }

  const fallbackProposal = `${greeting}

Your project requires addressing ${params.projectTitle.toLowerCase()}, and that's something I can build and deliver cleanly.

Recently I completed a similar project utilizing ${relatedSkills} with high performance and zero regressions. I work daily with ${relatedSkills}.

I would start by reviewing the exact technical specs, implement the core functionality first, and thoroughly test before handoff.

${cta}`;

  return {
    proposal: fallbackProposal.trim(),
    proposalSource: 'template',
    modelUsed: 'template-fallback (Add OpenAI API Key in Settings)',
    wordCount: fallbackProposal.split(/\s+/).filter(Boolean).length,
    recommendedBidAmount: defaultAmount,
    recommendedDeliveryDays: defaultDays,
    ctaQuestion: cta,
    pricingReasoning: `Default rule-based calculation (85% of client max budget: ${params.budget.currency} ${defaultAmount})`,
  };
}
