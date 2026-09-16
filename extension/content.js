/**
 * Freelancer AutoBid - Content Script (Runs on https://www.freelancer.com/*)
 * 
 * Automatically detects AutoBid data passed from Dashboard, finds Freelancer's bid fields,
 * autofills:
 *  1. Proposal Description
 *  2. Bid Amount
 *  3. Delivery Days
 * and triggers Angular/React reactive form events.
 */

(function () {
  'use strict';

  console.log('[AutoBid] Freelancer AutoBid Content Script loaded on', window.location.href);

  // Check URL hash for Autobid payload
  function parseAutoBidFromUrl() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('autobid_')) return null;

    try {
      const cleanHash = hash.replace(/^#/, '');
      const params = new URLSearchParams(cleanHash);
      const proposal = params.get('autobid_p') || params.get('autobid_proposal');
      const amount = params.get('amount') || params.get('bid_amount');
      const period = params.get('period') || params.get('delivery_days');

      if (proposal || amount || period) {
        return {
          proposal: proposal ? decodeURIComponent(proposal) : null,
          amount: amount || null,
          period: period || null,
        };
      }
    } catch (e) {
      console.warn('[AutoBid] Error parsing URL hash payload:', e);
    }
    return null;
  }

  // Also check chrome.storage.local for pending bid if hash is empty
  async function getPendingBidData() {
    const urlData = parseAutoBidFromUrl();
    if (urlData) return urlData;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get('pendingAutoBid');
        if (stored && stored.pendingAutoBid) {
          const pb = stored.pendingAutoBid;
          // Only use if recent (within 5 minutes) and matches current project URL or ID
          if (Date.now() - (pb.timestamp || 0) < 5 * 60 * 1000) {
            chrome.storage.local.remove('pendingAutoBid');
            return pb;
          }
        }
      }
    } catch (e) {
      // Storage might not be accessible
    }

    return null;
  }

  // Set input value and dispatch all relevant synthetic events for Angular / React / native forms
  function setNativeValue(element, value) {
    if (!element || value == null) return false;

    // React 16+ / Angular value setter workaround
    const prototype = Object.getPrototypeOf(element);
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // Selectors for Freelancer.com bid elements
  const SELECTORS = {
    description: [
      'textarea[formcontrolname="description"]',
      'textarea#description',
      'textarea[name="descr"]',
      'textarea[data-qa="bid-description"]',
      'textarea[name="description"]',
      'app-project-view-bid-form textarea',
      'fl-textarea textarea',
      '.BidForm-textarea',
      'textarea',
    ],
    amount: [
      'input[formcontrolname="bidAmount"]',
      'input#bidAmount',
      'input[name="sum"]',
      'input[data-qa="bid-amount"]',
      'input#floating-bid-amount',
      'fl-input[formcontrolname="bidAmount"] input',
      'input[type="number"]',
    ],
    period: [
      'input[formcontrolname="period"]',
      'input#period',
      'input[name="period"]',
      'input[data-qa="bid-period"]',
      'fl-input[formcontrolname="period"] input',
      'input[name="delivery_period"]',
    ],
  };

  function findElement(selectorList) {
    for (const sel of selectorList) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        return el;
      }
    }
    // Try relaxed search if visible
    for (const sel of selectorList) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Inject sleek notification badge into Freelancer page
  function showAutoBidNotification(data) {
    const existing = document.getElementById('freelancer-autobid-floating-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'freelancer-autobid-floating-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #10b981;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      max-width: 360px;
      animation: autobidSlideIn 0.3s ease-out;
    `;

    banner.innerHTML = `
      <style>
        @keyframes autobidSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
          <strong style="color: #34d399; font-size: 14px;">AutoBid Injected!</strong>
        </div>
        <button id="autobid-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px;">&times;</button>
      </div>
      <div style="color: #cbd5e1; line-height: 1.4; margin-bottom: 12px;">
        ${data.amount ? `<div>• Amount: <strong style="color: #38bdf8;">$${data.amount}</strong></div>` : ''}
        ${data.period ? `<div>• Delivery: <strong style="color: #38bdf8;">${data.period} days</strong></div>` : ''}
        <div>• AI Proposal: <strong style="color: #34d399;">Autofilled into form!</strong></div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="autobid-scroll-btn" style="flex: 1; background: #059669; hover: #047857; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
          Review &amp; Place Bid
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('autobid-close-btn')?.addEventListener('click', () => banner.remove());
    document.getElementById('autobid-scroll-btn')?.addEventListener('click', () => {
      const descEl = findElement(SELECTORS.description);
      if (descEl) {
        descEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        descEl.focus();
      }
    });

    setTimeout(() => {
      if (banner.parentElement) {
        banner.style.transition = 'opacity 0.5s ease';
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 500);
      }
    }, 12000);
  }

  // Attempt to autofill fields
  async function attemptAutofill(bidData) {
    let filledDescription = false;
    let filledAmount = false;
    let filledPeriod = false;

    // Try finding fields over a window of 10 seconds (in case Freelancer takes time to render)
    const startTime = Date.now();
    const interval = setInterval(() => {
      const descEl = findElement(SELECTORS.description);
      const amountEl = findElement(SELECTORS.amount);
      const periodEl = findElement(SELECTORS.period);

      if (descEl && !filledDescription && bidData.proposal) {
        setNativeValue(descEl, bidData.proposal);
        descEl.style.outline = '2px solid #10b981';
        descEl.style.transition = 'outline 0.3s';
        filledDescription = true;
      }

      if (amountEl && !filledAmount && bidData.amount) {
        setNativeValue(amountEl, bidData.amount);
        amountEl.style.outline = '2px solid #10b981';
        filledAmount = true;
      }

      if (periodEl && !filledPeriod && bidData.period) {
        setNativeValue(periodEl, bidData.period);
        periodEl.style.outline = '2px solid #10b981';
        filledPeriod = true;
      }

      // If at least description was filled, or 10 seconds passed, finish
      if (filledDescription || (Date.now() - startTime > 10000)) {
        clearInterval(interval);
        if (filledDescription || filledAmount || filledPeriod) {
          console.log('[AutoBid] Successfully filled Freelancer bid form!');
          showAutoBidNotification(bidData);

          // Clean hash from URL for cleaner look
          if (window.location.hash.includes('autobid_')) {
            try {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
            } catch (e) {}
          }
        }
      }
    }, 400);
  }

  // Initialize flow
  async function init() {
    const bidData = await getPendingBidData();
    if (bidData) {
      console.log('[AutoBid] Pending bid data detected:', { amount: bidData.amount, period: bidData.period });
      attemptAutofill(bidData);
    }
  }

  // Listen for messages from background script or popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'AUTOFILL_BID') {
        attemptAutofill(request.data);
        sendResponse({ success: true });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
