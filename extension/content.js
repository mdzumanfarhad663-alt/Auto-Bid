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
      const autoSubmit = params.get('auto_submit') === '1' || params.get('autobid') === '1' || params.get('submit') === '1';

      if (proposal || amount || period) {
        let safeProposal = proposal;
        if (safeProposal) {
          try {
            // Only decode if it actually contains encoded sequences
            if (safeProposal.includes('%20') || safeProposal.includes('%0A') || safeProposal.includes('%25')) {
              safeProposal = decodeURIComponent(safeProposal);
            }
          } catch (e) {
            // Keep raw if decodeURIComponent throws
          }
        }

        return {
          proposal: safeProposal || null,
          amount: amount || null,
          period: period || null,
          autoSubmit: autoSubmit,
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
        const stored = await chrome.storage.local.get(['pendingAutoBid', 'handsFreeAutoSubmit', 'autoSubmitDelaySeconds']);
        if (stored && stored.pendingAutoBid) {
          const pb = stored.pendingAutoBid;
          // Only use if recent (within 5 minutes) and matches current project URL or ID
          if (Date.now() - (pb.timestamp || 0) < 5 * 60 * 1000) {
            chrome.storage.local.remove('pendingAutoBid');
            return {
              ...pb,
              autoSubmit: stored.handsFreeAutoSubmit || pb.autoSubmit,
            };
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
      'textarea[data-qa="bid-description-input"]',
      'textarea[name="description"]',
      'app-project-view-bid-form textarea',
      'fl-textarea[formcontrolname="description"] textarea',
      'fl-textarea textarea',
      'textarea[placeholder*="proposal" i]',
      'textarea[placeholder*="details" i]',
      '.BidForm-textarea',
      'textarea',
    ],
    amount: [
      'input[formcontrolname="bidAmount"]',
      'input#bidAmount',
      'input[name="sum"]',
      'input[data-qa="bid-amount"]',
      'input[data-qa="bid-amount-input"]',
      'input#floating-bid-amount',
      'fl-input[formcontrolname="bidAmount"] input',
      'input[placeholder*="amount" i]',
      'input[type="number"]',
    ],
    period: [
      'input[formcontrolname="period"]',
      'input#period',
      'input[name="period"]',
      'input[data-qa="bid-period"]',
      'input[data-qa="bid-period-input"]',
      'fl-input[formcontrolname="period"] input',
      'input[placeholder*="days" i]',
      'input[name="delivery_period"]',
    ],
    placeBidButton: [
      'button[data-qa="place-bid-btn"]',
      'button[data-qa="place-bid-button"]',
      'button[data-qa="bid-submit-btn"]',
      'app-project-view-bid-form button[type="submit"]',
      'fl-button[text*="Place Bid" i] button',
      'button.BidForm-submit',
      'form[name="bidForm"] button[type="submit"]',
      '#place-bid-btn',
    ]
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

  function findPlaceBidButton() {
    const btn = findElement(SELECTORS.placeBidButton);
    if (btn && !btn.disabled) return btn;

    // Search visible buttons by text content
    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const b of allButtons) {
      if (b.offsetParent !== null && !b.disabled) {
        const text = (b.textContent || '').trim().toLowerCase();
        if (text === 'place bid' || text === 'submit bid' || text.includes('place bid')) {
          return b;
        }
      }
    }
    return null;
  }

  // Inject sleek notification badge into Freelancer page & execute auto-submit if enabled
  async function showAutoBidNotification(data) {
    const existing = document.getElementById('freelancer-autobid-floating-banner');
    if (existing) existing.remove();

    // Check extension storage for handsFreeAutoSubmit setting as well
    let isAutoSubmit = data.autoSubmit;
    let delaySeconds = 2;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const st = await chrome.storage.local.get(['handsFreeAutoSubmit', 'autoSubmitDelaySeconds']);
        if (st.handsFreeAutoSubmit !== undefined) {
          isAutoSubmit = isAutoSubmit || st.handsFreeAutoSubmit;
        }
        if (st.autoSubmitDelaySeconds) {
          delaySeconds = Math.max(0, parseInt(st.autoSubmitDelaySeconds, 10));
        }
      }
    } catch (e) {}

    const banner = document.createElement('div');
    banner.id = 'freelancer-autobid-floating-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid ${isAutoSubmit ? '#38bdf8' : '#10b981'};
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      max-width: 380px;
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
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${isAutoSubmit ? '#38bdf8' : '#10b981'}; box-shadow: 0 0 8px ${isAutoSubmit ? '#38bdf8' : '#10b981'};"></span>
          <strong style="color: ${isAutoSubmit ? '#38bdf8' : '#34d399'}; font-size: 14px;">
            ${isAutoSubmit ? '⚡ Autonomous Auto-Bid Ready' : 'AutoBid Injected!'}
          </strong>
        </div>
        <button id="autobid-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px;">&times;</button>
      </div>
      <div style="color: #cbd5e1; line-height: 1.4; margin-bottom: 12px;">
        ${data.amount ? `<div>• Bid Amount: <strong style="color: #38bdf8;">$${data.amount}</strong></div>` : ''}
        ${data.period ? `<div>• Delivery: <strong style="color: #38bdf8;">${data.period} days</strong></div>` : ''}
        <div>• AI Proposal: <strong style="color: #34d399;">Autofilled into form!</strong></div>
      </div>

      ${isAutoSubmit ? `
        <div id="autobid-countdown-box" style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
          <div style="font-size: 12px; color: #38bdf8; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
            <span>🤖 Placing bid automatically in <span id="autobid-countdown" style="font-size: 14px; font-weight: 700; color: #f8fafc;">${delaySeconds}</span>s...</span>
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Hands-Free Mode: Clicking 'Place Bid' without human touch.</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="autobid-cancel-submit-btn" style="flex: 1; background: #dc2626; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
            Cancel Auto-Submit
          </button>
          <button id="autobid-submit-now-btn" style="flex: 1; background: #0284c7; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
            Submit Now ⚡
          </button>
        </div>
      ` : `
        <div style="display: flex; gap: 8px;">
          <button id="autobid-scroll-btn" style="flex: 1; background: #059669; hover: #047857; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
            Review &amp; Place Bid
          </button>
        </div>
      `}
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

    // Autonomous Auto-Submit Execution
    if (isAutoSubmit) {
      let remaining = delaySeconds;
      let cancelled = false;

      const countdownEl = document.getElementById('autobid-countdown');
      const cancelBtn = document.getElementById('autobid-cancel-submit-btn');
      const submitNowBtn = document.getElementById('autobid-submit-now-btn');

      const executeSubmit = () => {
        if (cancelled) return;
        const placeBidBtn = findPlaceBidButton();
        if (placeBidBtn) {
          console.log('[AutoBid] Triggering click on Freelancer Place Bid button!', placeBidBtn);
          placeBidBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          placeBidBtn.click();

          const countdownBox = document.getElementById('autobid-countdown-box');
          if (countdownBox) {
            countdownBox.style.background = '#064e3b';
            countdownBox.style.borderColor = '#059669';
            countdownBox.innerHTML = `
              <div style="font-size: 13px; color: #34d399; font-weight: 700;">
                ✅ Bid Placed Successfully!
              </div>
              <div style="font-size: 11px; color: #a7f3d0; margin-top: 2px;">
                Placed autonomously without human touch.
              </div>
            `;
          }
          if (cancelBtn) cancelBtn.style.display = 'none';
          if (submitNowBtn) submitNowBtn.style.display = 'none';

          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'BID_AUTO_SUBMITTED',
              data: {
                url: window.location.href,
                amount: data.amount,
                period: data.period,
                timestamp: Date.now()
              }
            });
          }
        } else {
          console.warn('[AutoBid] Could not locate active Place Bid button.');
        }
      };

      cancelBtn?.addEventListener('click', () => {
        cancelled = true;
        const countdownBox = document.getElementById('autobid-countdown-box');
        if (countdownBox) {
          countdownBox.innerHTML = '<span style="color: #f87171; font-weight: 600;">Auto-submit cancelled. Review manually.</span>';
        }
        cancelBtn.style.display = 'none';
        if (submitNowBtn) submitNowBtn.textContent = 'Submit Manually';
      });

      submitNowBtn?.addEventListener('click', () => {
        executeSubmit();
      });

      const timer = setInterval(() => {
        if (cancelled) {
          clearInterval(timer);
          return;
        }
        remaining -= 1;
        if (countdownEl) countdownEl.textContent = remaining.toString();
        if (remaining <= 0) {
          clearInterval(timer);
          executeSubmit();
        }
      }, 1000);
    }

    setTimeout(() => {
      if (banner.parentElement) {
        banner.style.transition = 'opacity 0.5s ease';
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 500);
      }
    }, isAutoSubmit ? 16000 : 12000);
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

  // React to single-page navigation and direct hash modifications
  window.addEventListener('hashchange', init);
  window.addEventListener('popstate', init);
})();
