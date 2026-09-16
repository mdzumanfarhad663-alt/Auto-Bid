/**
 * Freelancer AutoBid - Content Script (Runs on https://www.freelancer.com/*)
 * 
 * Automatically detects AutoBid data passed from Dashboard or Background, finds Freelancer's bid fields,
 * and autofills:
 *  1. Proposal Description
 *  2. Bid Amount
 *  3. Delivery Days
 * and triggers complete reactive form events + auto-submits if enabled.
 */

(function () {
  'use strict';

  // Capture hash immediately at document_start before Angular/SPA router strips it
  let capturedHash = window.location.hash || '';
  if (capturedHash && (capturedHash.includes('autobid') || capturedHash.includes('amount') || capturedHash.includes('period') || capturedHash.includes('pid'))) {
    try {
      sessionStorage.setItem('__freelancer_autobid_hash__', capturedHash);
    } catch (e) {}
  } else {
    try {
      capturedHash = sessionStorage.getItem('__freelancer_autobid_hash__') || '';
    } catch (e) {}
  }

  console.log('[AutoBid] Freelancer AutoBid Content Script initialized. Hash snapshot:', capturedHash ? 'Captured' : 'None');

  // Parse Autobid payload from captured hash or current URL
  function parseAutoBidFromUrl() {
    const hash = window.location.hash || capturedHash || '';
    if (!hash || (!hash.includes('autobid') && !hash.includes('amount') && !hash.includes('period') && !hash.includes('proposal') && !hash.includes('autobid_p'))) {
      return null;
    }

    try {
      const cleanHash = hash.replace(/^#/, '');
      const params = new URLSearchParams(cleanHash);
      const proposal = params.get('autobid_p') || params.get('autobid_proposal') || params.get('proposal');
      const amount = params.get('amount') || params.get('bid_amount');
      const period = params.get('period') || params.get('delivery_days');
      const autoSubmit = params.get('auto_submit') === '1' || params.get('autobid') === '1' || params.get('submit') === '1';

      if (proposal || amount || period) {
        let safeProposal = proposal;
        if (safeProposal) {
          try {
            if (safeProposal.includes('%20') || safeProposal.includes('%0A') || safeProposal.includes('%25')) {
              safeProposal = decodeURIComponent(safeProposal);
            }
          } catch (e) {}
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

  // Retrieve pending bid data from URL hash or chrome.storage.local
  async function getPendingBidData() {
    const urlData = parseAutoBidFromUrl();
    if (urlData && (urlData.proposal || urlData.amount)) return urlData;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get(['pendingAutoBid', 'handsFreeAutoSubmit', 'autoSubmitDelaySeconds']);
        if (stored && stored.pendingAutoBid) {
          const pb = stored.pendingAutoBid;
          if (Date.now() - (pb.timestamp || 0) < 5 * 60 * 1000) {
            return {
              ...pb,
              autoSubmit: stored.handsFreeAutoSubmit !== undefined ? stored.handsFreeAutoSubmit : pb.autoSubmit,
            };
          }
        }
      }
    } catch (e) {}

    return null;
  }

  // Helper to query element piercing shadow DOM
  function queryDeep(selector, root = document) {
    let el = root.querySelector(selector);
    if (el) return el;

    // Search shadow roots
    const all = root.querySelectorAll('*');
    for (const node of all) {
      if (node.shadowRoot) {
        const found = queryDeep(selector, node.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  // Selectors for Freelancer.com bid elements
  const SELECTORS = {
    openBidFormButton: [
      'button[data-qa="bid-button"]',
      'button[data-qa="place-bid-open"]',
      'fl-button[text*="Bid on" i] button',
      'button.ProjectView-bid-btn',
      'button:not([disabled])',
    ],
    description: [
      'textarea[formcontrolname="description"]',
      'textarea#description',
      'textarea[name="descr"]',
      'textarea[name="description"]',
      'textarea[data-qa="bid-description"]',
      'textarea[data-qa="bid-description-input"]',
      'fl-textarea[formcontrolname="description"] textarea',
      'fl-textarea textarea',
      'app-project-view-bid-form textarea',
      'app-bid-form textarea',
      'textarea.BidForm-textarea',
      'textarea[placeholder*="proposal" i]',
      'textarea[placeholder*="details" i]',
      'textarea[placeholder*="bid" i]',
      'textarea',
    ],
    amount: [
      'input[formcontrolname="bidAmount"]',
      'input#bidAmount',
      'input[name="sum"]',
      'input[name="bidAmount"]',
      'input[data-qa="bid-amount"]',
      'input[data-qa="bid-amount-input"]',
      'input#floating-bid-amount',
      'fl-input[formcontrolname="bidAmount"] input',
      'fl-input input[type="number"]',
      'app-project-view-bid-form input[type="number"]',
      'app-bid-form input[type="number"]',
      'input[placeholder*="amount" i]',
      'input[placeholder*="price" i]',
      'input[placeholder*="bid" i]',
      'input[type="number"]',
    ],
    period: [
      'input[formcontrolname="period"]',
      'input#period',
      'input[name="period"]',
      'input[data-qa="bid-period"]',
      'input[data-qa="bid-period-input"]',
      'fl-input[formcontrolname="period"] input',
      'input[name="delivery_period"]',
      'input[placeholder*="days" i]',
      'input[placeholder*="period" i]',
    ],
    placeBidButton: [
      'button[data-qa="place-bid-btn"]',
      'button[data-qa="place-bid-button"]',
      'button[data-qa="bid-submit-btn"]',
      'app-project-view-bid-form button[type="submit"]',
      'app-bid-form button[type="submit"]',
      'fl-button[text*="Place Bid" i] button',
      'fl-button[text*="Place Bid" i]',
      'button.BidForm-submit',
      'form[name="bidForm"] button[type="submit"]',
      '#place-bid-btn',
    ]
  };

  function findElement(selectorList) {
    for (const sel of selectorList) {
      const el = queryDeep(sel);
      if (el && el.offsetParent !== null) {
        return el;
      }
    }
    // Fallback: search without visibility constraint
    for (const sel of selectorList) {
      const el = queryDeep(sel);
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

  // Set input value and dispatch all relevant synthetic events for Angular / React / native forms
  function setNativeValue(element, value) {
    if (!element || value == null) return false;

    try {
      element.focus();
    } catch (e) {}

    // React / Angular value setter workaround
    const prototype = Object.getPrototypeOf(element);
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }

    try {
      element.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      try {
        element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: String(value) }));
      } catch (ie) {}
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
      element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    } catch (e) {}
    return true;
  }

  // Open the bid form if it's currently collapsed/hidden behind a "Bid on this Project" button
  function maybeOpenBidForm() {
    const desc = findElement(SELECTORS.description);
    if (!desc || desc.offsetParent === null) {
      const allButtons = Array.from(document.querySelectorAll('button, a'));
      for (const b of allButtons) {
        const text = (b.textContent || '').trim().toLowerCase();
        if (text.includes('bid on this project') || text === 'place a bid' || text === 'bid now') {
          console.log('[AutoBid] Clicking open bid form button:', b);
          b.click();
          break;
        }
      }
    }
  }

  // Inject sleek notification badge into Freelancer page & execute auto-submit if enabled
  async function showAutoBidNotification(data) {
    const existing = document.getElementById('freelancer-autobid-floating-banner');
    if (existing) existing.remove();

    let isAutoSubmit = data.autoSubmit !== false;
    let delaySeconds = 2;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const st = await chrome.storage.local.get(['handsFreeAutoSubmit', 'autoSubmitDelaySeconds']);
        if (st.handsFreeAutoSubmit !== undefined) {
          isAutoSubmit = st.handsFreeAutoSubmit;
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
      z-index: 99999999;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid ${isAutoSubmit ? '#38bdf8' : '#10b981'};
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6);
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
        <div>• Proposal: <strong style="color: #34d399;">Autofilled into form!</strong></div>
      </div>

      ${isAutoSubmit ? `
        <div id="autobid-countdown-box" style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
          <div style="font-size: 12px; color: #38bdf8; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
            <span>🤖 Placing bid automatically in <span id="autobid-countdown" style="font-size: 14px; font-weight: 700; color: #f8fafc;">${delaySeconds}</span>s...</span>
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Hands-Free: Clicking 'Place Bid' without human touch.</div>
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
          <button id="autobid-scroll-btn" style="flex: 1; background: #059669; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
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
          
          // Dispatch mouse events + click
          try {
            placeBidBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            placeBidBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          } catch (e) {}
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

  // Attempt to autofill fields repeatedly until elements are rendered
  let autofillRunning = false;
  async function attemptAutofill(bidData) {
    if (!bidData) return;
    if (autofillRunning) return;
    autofillRunning = true;

    let filledDescription = false;
    let filledAmount = false;
    let filledPeriod = false;

    console.log('[AutoBid] Starting autofill poll for:', { amount: bidData.amount, period: bidData.period });

    const startTime = Date.now();
    const interval = setInterval(() => {
      maybeOpenBidForm();

      const descEl = findElement(SELECTORS.description);
      const amountEl = findElement(SELECTORS.amount);
      const periodEl = findElement(SELECTORS.period);

      if (descEl && !filledDescription && bidData.proposal) {
        setNativeValue(descEl, bidData.proposal);
        descEl.style.outline = '2px solid #10b981';
        descEl.style.transition = 'outline 0.3s';
        filledDescription = true;
        console.log('[AutoBid] Filled description textarea!');
      }

      if (amountEl && !filledAmount && bidData.amount) {
        setNativeValue(amountEl, bidData.amount);
        amountEl.style.outline = '2px solid #10b981';
        filledAmount = true;
        console.log('[AutoBid] Filled amount input!');
      }

      if (periodEl && !filledPeriod && bidData.period) {
        setNativeValue(periodEl, bidData.period);
        periodEl.style.outline = '2px solid #10b981';
        filledPeriod = true;
        console.log('[AutoBid] Filled delivery period input!');
      }

      // If at least description was filled, or 18 seconds passed, finish
      if ((filledDescription && (filledAmount || !bidData.amount)) || (Date.now() - startTime > 18000)) {
        clearInterval(interval);
        autofillRunning = false;
        if (filledDescription || filledAmount || filledPeriod) {
          console.log('[AutoBid] Successfully filled Freelancer bid form!');
          showAutoBidNotification(bidData);

          // Clear cached hash
          try {
            sessionStorage.removeItem('__freelancer_autobid_hash__');
          } catch (e) {}
        }
      }
    }, 300);
  }

  // Initialize flow
  async function init() {
    const bidData = await getPendingBidData();
    if (bidData) {
      console.log('[AutoBid] Pending bid data found, executing autofill...');
      attemptAutofill(bidData);
    }
  }

  // Listen for messages from background script or dashboard
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'AUTOFILL_BID') {
        console.log('[AutoBid] Received AUTOFILL_BID message from background:', request.data);
        attemptAutofill(request.data);
        sendResponse({ success: true });
      }
    });
  }

  // Run on load and whenever DOM elements change
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also trigger on window load & mutation
  window.addEventListener('load', init);
  window.addEventListener('hashchange', init);
  window.addEventListener('popstate', init);
})();
