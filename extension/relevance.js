/**
 * AI relevance gate, shared by the dashboard server and the extension service worker.
 *
 * Keyword filters are cheap but blunt: "WordPress" matches a WordPress build and a request
 * to write a blog post about WordPress. Projects that pass the exact filters are sent here,
 * and a model judges them against a prompt the user writes in their own words. Every
 * verdict carries a one-sentence reason that is shown next to the project.
 */

export const DEFAULT_RELEVANCE_PROMPT = `You screen Freelancer.com projects for a web developer. Decide whether this project is worth bidding on.

A good match is a real build, fix, or migration job that a skilled web developer can deliver remotely, such as WordPress, Shopify, PHP, HTML/CSS, JavaScript, React, or similar work.

Reject projects that:
- Only mention a platform in passing but are really about writing, marketing, design-only, data entry, or admin work
- Are vague one-line postings with no clear deliverable
- Ask for free work, samples before hiring, or payment outside the platform
- Are academic assignments, essays, or anything that looks like homework
- Need on-site presence or a specific country of residence

Be strict. A borderline project should be rejected.`;

// Description text is capped so a long brief cannot run up the token bill.
const MAX_DESCRIPTION_CHARS = 1800;

// gpt-4o-mini list price, per token. Used for the running cost estimate only.
const PRICE_PER_INPUT_TOKEN = 0.15 / 1_000_000;
const PRICE_PER_OUTPUT_TOKEN = 0.6 / 1_000_000;

export function estimateRelevanceCostUSD(inputTokens, outputTokens) {
  return (Number(inputTokens) || 0) * PRICE_PER_INPUT_TOKEN + (Number(outputTokens) || 0) * PRICE_PER_OUTPUT_TOKEN;
}

function buildMessages(project, config) {
  const userPrompt = (config.relevancePrompt || '').trim() || DEFAULT_RELEVANCE_PROMPT;
  const mySkills = Array.isArray(config.freelancerSkills) ? config.freelancerSkills.join(', ') : '';

  const system = `${userPrompt}

${mySkills ? `The freelancer's skills: ${mySkills}.\n` : ''}
Respond with JSON only, in this exact shape:
{"eligible": true or false, "score": integer 0-100 for how well this project fits, "reason": "one short sentence a person can read"}`;

  const description = String(project.description || '').slice(0, MAX_DESCRIPTION_CHARS);
  const skills = (project.jobs || []).map((j) => (typeof j === 'string' ? j : j.name)).filter(Boolean).join(', ');
  const budget = project.budget
    ? `${project.budget.minimum}-${project.budget.maximum} ${project.budget.currency}${project.type === 'hourly' ? ' per hour' : ''}`
    : 'not stated';

  const user = `Title: ${project.title}
Type: ${project.type || 'fixed'}
Budget: ${budget}
Skills listed: ${skills || 'none'}
Existing bids: ${typeof project.bidCount === 'number' ? project.bidCount : 'unknown'}
Client country: ${project.client?.country || 'unknown'}

Description:
"""
${description}
"""`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Judge one project. Resolves to { eligible, score, reason, tokens, costUSD }.
 * Throws on transport or API errors so callers can decide whether to retry.
 */
export async function checkRelevance(project, config, options = {}) {
  const apiKey = (options.apiKey || config.openaiApiKey || '').trim();
  if (!apiKey) throw new Error('OpenAI API key is required for the relevance check');

  const fetchImpl = options.fetch || globalThis.fetch;
  const model = (config.customOpenAiModel || '').trim() || config.openaiModel || 'gpt-4o-mini';

  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(project, config),
      temperature: 0.2,
      max_tokens: 120,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error (${response.status}): ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Relevance check returned malformed JSON');
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score)) || 0));
  const minScore = Math.max(0, Math.min(100, Number(config.relevanceMinScore) || 0));
  // Both the model's verdict and the score threshold must agree, so a user can tighten
  // the gate with a number without rewriting the prompt.
  const eligible = parsed.eligible === true && score >= minScore;

  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  return {
    eligible,
    score,
    reason: String(parsed.reason || (eligible ? 'Good match' : 'Not a good match')).trim().slice(0, 300),
    model,
    tokens: inputTokens + outputTokens,
    costUSD: estimateRelevanceCostUSD(inputTokens, outputTokens),
  };
}
