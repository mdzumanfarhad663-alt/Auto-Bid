/**
 * Freelancer API Poller and Generator
 * Polls https://www.freelancer.com/api/projects/0.1/projects/active/
 * or generates realistic mock stream when testing in sandbox.
 */

import { FreelancerProject } from '../types.ts';
import { projectStore } from './store.ts';
import { buildActiveFeedUrl, mapActiveProject } from '../../extension/qualification.js';

const SAMPLE_PROJECT_TEMPLATES = [
  {
    title: 'Migrate legacy WordPress website to headless Next.js and Tailwind CSS',
    description: 'We need an expert full stack developer to export 400 blog posts and products from our legacy WordPress site into a modern Next.js 14 App Router frontend with Tailwind CSS and Sanity/WP GraphQL backend. Must ensure 100 SEO preservation and 301 redirects.',
    jobs: ['WordPress', 'Next.js', 'React', 'Tailwind CSS', 'PHP', 'HTML'],
    min: 400,
    max: 1200,
    curr: 'USD',
    client: { username: 'growth_studio', rating: 4.9, reviews: 31, verified: true, country: 'United States' }
  },
  {
    title: 'Shopify Store Speed Optimization to 90+ Mobile on Google PageSpeed',
    description: 'Our Shopify store mobile score dropped to 34 after installing 6 apps. Need a Shopify liquid and JS performance engineer to eliminate render-blocking JS, lazyload images, and defer non-critical app scripts without breaking tracking tags.',
    jobs: ['Shopify', 'JavaScript', 'CSS', 'HTML', 'Website Optimization'],
    min: 200,
    max: 500,
    curr: 'USD',
    client: { username: 'silk_cosmetics', rating: 4.8, reviews: 18, verified: true, country: 'Australia' }
  },
  {
    title: 'Custom PHP & MySQL backend fix for order recalculation and PDF invoices',
    description: 'Our custom PHP ERP has a bug in the discount calculation when tax is applied. We also need to update the DOMPDF invoice template to support multi-currency formatting and QR code payment links.',
    jobs: ['PHP', 'MySQL', 'HTML', 'CSS', 'JavaScript'],
    min: 150,
    max: 450,
    curr: 'USD',
    client: { username: 'logistics_hub', rating: 5.0, reviews: 64, verified: true, country: 'Germany' }
  }
];

let pollIntervalTimer: NodeJS.Timeout | null = null;
let currentIntervalSeconds = 30;

/**
 * Fetch and parse Freelancer's public RSS feed: https://www.freelancer.com/rss.xml
 * Requires NO OAuth token, accessible publicly worldwide!
 */
export async function fetchFromFreelancerRssFeed(): Promise<FreelancerProject[]> {
  try {
    const res = await fetch('https://www.freelancer.com/rss.xml', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!res.ok) {
      console.warn(`[FreelancerPoller] RSS feed HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const projects: FreelancerProject[] = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

    for (const match of itemMatches) {
      const itemContent = match[1];

      // Extract Title
      const titleMatch = itemContent.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                         itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : 'Untitled Project';

      // Extract Link
      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const link = linkMatch ? linkMatch[1].trim() : '';

      // Extract GUID / ID
      const guidMatch = itemContent.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
      const rawGuid = guidMatch ? guidMatch[1].trim() : '';
      const idMatch = rawGuid.match(/\d+/) || link.match(/\/(\d+)(?:\.html)?$/);
      const id = idMatch ? parseInt(idMatch[0], 10) : Math.floor(Math.random() * 8999999) + 40000000;

      // Extract Raw Description
      const descMatch = itemContent.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                        itemContent.match(/<description>([\s\S]*?)<\/description>/);
      const rawDesc = descMatch ? descMatch[1].trim() : '';

      // Extract Categories / Jobs
      const categories: string[] = [];
      const catMatches = itemContent.matchAll(/<category[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g);
      for (const cat of catMatches) {
        const catName = cat[1].trim();
        if (catName && !categories.includes(catName)) {
          categories.push(catName);
        }
      }

      // Parse Budget & Currency from description string
      // Format examples:
      // "(Budget: $30 - $250 USD, Jobs: ...)"
      // "(Budget: ₹25000 - ₹30000 INR, Jobs: ...)"
      // "(Budget: £20 - £250 GBP, Jobs: ...)"
      // "(Budget: €100 - €400 EUR, Jobs: ...)"
      // "(Budget: $15 - $25 USD / hr, Jobs: ...)"
      let budgetMin = 50;
      let budgetMax = 250;
      let currency = 'USD';

      const budgetRangeMatch = rawDesc.match(/\(Budget:\s*([^\d\s]*)\s*(\d+(?:\.\d+)?)\s*-\s*([^\d\s]*)\s*(\d+(?:\.\d+)?)\s*([A-Z]{3})/i);
      const budgetSingleMatch = rawDesc.match(/\(Budget:\s*([^\d\s]*)\s*(\d+(?:\.\d+)?)\s*([A-Z]{3})/i);

      if (budgetRangeMatch) {
        budgetMin = parseFloat(budgetRangeMatch[2]);
        budgetMax = parseFloat(budgetRangeMatch[4]);
        currency = budgetRangeMatch[5].toUpperCase();
      } else if (budgetSingleMatch) {
        budgetMin = parseFloat(budgetSingleMatch[2]);
        budgetMax = budgetMin * 2;
        currency = budgetSingleMatch[3].toUpperCase();
      }

      // Extract jobs list from the end of the description if present: "Jobs: X, Y, Z)"
      const jobsInDescMatch = rawDesc.match(/Jobs:\s*([^)]+)\)/i);
      if (jobsInDescMatch && categories.length === 0) {
        const parsedJobs = jobsInDescMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
        categories.push(...parsedJobs);
      }

      // Clean the description for presentation
      const cleanDesc = rawDesc
        .replace(/\(Budget:.*?\)$/i, '')
        .replace(/\.\.\.\s*$/, '')
        .trim();

      // Extract pubDate
      const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const submitDate = pubDateMatch ? new Date(pubDateMatch[1].trim()).getTime() : Date.now();

      projects.push({
        id,
        title,
        description: cleanDesc || title,
        submitDate: isNaN(submitDate) ? Date.now() : submitDate,
        budget: {
          minimum: budgetMin,
          maximum: budgetMax,
          currency,
        },
        jobs: (categories.length > 0 ? categories : ['General Freelance']).map((name, idx) => ({
          id: idx + 1,
          name,
        })),
        // RSS carries no client data. Leave it empty and flag it, so client-based
        // filters skip these instead of judging invented values.
        client: {
          id: 0,
          username: 'freelancer_client',
          rating: 0,
          reviewsCount: 0,
          paymentVerified: false,
          identityVerified: false,
          country: 'Unknown',
        },
        clientDataAvailable: false,
        status: 'PENDING',
        url: link || `https://www.freelancer.com/projects/${id}`,
        feedSource: 'rss',
      });
    }

    return projects;
  } catch (err) {
    console.warn('[FreelancerPoller] Error parsing Freelancer RSS feed:', err);
    return [];
  }
}

/**
 * Fetch from Freelancer's active public JSON API endpoint.
 * Requires NO OAuth token for public listings!
 */
export async function fetchFromFreelancerPublicApi(): Promise<FreelancerProject[]> {
  try {
    const token = process.env.FREELANCER_OAUTH_TOKEN;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (token && token.trim() !== '' && !token.startsWith('your_freelancer')) {
      headers['freelancer-oauth-v1'] = token.trim();
    }

    const response = await fetch(buildActiveFeedUrl(30), { headers });

    if (!response.ok) {
      console.warn(`[FreelancerPoller] Public API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    const rawList = data.result?.projects || [];
    return rawList.map((p: any) => mapActiveProject(p) as FreelancerProject);
  } catch (err) {
    console.warn('[FreelancerPoller] Error fetching from Freelancer Public API:', err);
    return [];
  }
}

export async function fetchFreelancerActiveProjects(): Promise<FreelancerProject[]> {
  const config = projectStore.getConfig();
  const feedSource = config.feedSource || 'auto';

  let projects: FreelancerProject[] = [];

  // Strategy 1: If user requested RSS feed explicitly
  if (feedSource === 'rss') {
    projects = await fetchFromFreelancerRssFeed();
    if (projects.length > 0) {
      console.log(`[FreelancerPoller] Retrieved ${projects.length} projects via Freelancer RSS feed`);
      return projects;
    }
  }

  // Strategy 2: If user requested Public API explicitly
  if (feedSource === 'public_api') {
    projects = await fetchFromFreelancerPublicApi();
    if (projects.length > 0) {
      console.log(`[FreelancerPoller] Retrieved ${projects.length} projects via Freelancer Public API feed`);
      return projects;
    }
  }

  // Strategy 3: Auto mode (try RSS, then Public API, or merge them!)
  try {
    const [rssProjects, apiProjects] = await Promise.all([
      fetchFromFreelancerRssFeed().catch(() => []),
      fetchFromFreelancerPublicApi().catch(() => []),
    ]);

    // Merge by unique project ID. API entries first: they carry client data, RSS does not.
    const projectMap = new Map<number, FreelancerProject>();
    for (const p of [...apiProjects, ...rssProjects]) {
      if (!projectMap.has(p.id)) {
        projectMap.set(p.id, p);
      }
    }

    projects = Array.from(projectMap.values());
    if (projects.length > 0) {
      console.log(`[FreelancerPoller] Retrieved ${projects.length} live projects from Freelancer public feed (RSS: ${rssProjects.length}, API: ${apiProjects.length})`);
      return projects;
    }
  } catch (err) {
    console.warn('[FreelancerPoller] Auto feed retrieval error:', err);
  }

  // Fallback: Sandbox / simulation mode if network completely fails
  console.log('[FreelancerPoller] Using fallback sample project stream');
  const template = SAMPLE_PROJECT_TEMPLATES[Math.floor(Math.random() * SAMPLE_PROJECT_TEMPLATES.length)];
  const randomizedId = 40700000 + Math.floor(Math.random() * 90000);

  return [
    {
      id: randomizedId,
      title: template.title,
      description: template.description,
      submitDate: Date.now(),
      budget: {
        minimum: template.min,
        maximum: template.max,
        currency: template.curr,
      },
      jobs: template.jobs.map((name, i) => ({ id: i + 100, name })),
      client: {
        id: Math.floor(Math.random() * 800000) + 100000,
        username: template.client.username,
        rating: template.client.rating,
        reviewsCount: template.client.reviews,
        paymentVerified: template.client.verified,
        identityVerified: template.client.verified,
        country: template.client.country,
      },
      status: 'PENDING',
      url: `https://www.freelancer.com/search/projects?q=${encodeURIComponent(template.jobs[0] || 'web development')}`,
      feedSource: 'direct',
    },
  ];
}

export async function runPollCycle(): Promise<FreelancerProject[]> {
  try {
    const incomingProjects = await fetchFreelancerActiveProjects();
    const processed: FreelancerProject[] = [];

    for (const p of incomingProjects) {
      const result = await projectStore.processProject(p);
      processed.push(result);
    }

    return processed;
  } catch (err) {
    console.error('[FreelancerPoller] Error during poll cycle:', err);
    return [];
  }
}

export function startBackgroundPoller(intervalSeconds = 30) {
  currentIntervalSeconds = intervalSeconds;
  if (pollIntervalTimer) {
    clearInterval(pollIntervalTimer);
  }

  console.log(`[FreelancerPoller] Starting background Freelancer poller every ${intervalSeconds}s (No OAuth required)`);
  pollIntervalTimer = setInterval(() => {
    const config = projectStore.getConfig();
    // Check if interval was changed by user in settings
    if (config.pollIntervalSeconds && config.pollIntervalSeconds !== currentIntervalSeconds) {
      startBackgroundPoller(config.pollIntervalSeconds);
      return;
    }

    if (config.autoBidEnabled) {
      runPollCycle().catch((err) => console.error('[FreelancerPoller] Background run error:', err));
    }
  }, Math.max(10, intervalSeconds) * 1000);
}
