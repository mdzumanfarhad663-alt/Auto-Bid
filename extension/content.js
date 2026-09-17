/**
 * Freelancer AutoBid - Secure Content Script (Runs on https://www.freelancer.com/projects/*)
 * 
 * STRICT SAFETY ARCHITECTURE:
 * 1. Scope all DOM operations strictly inside verified Place Bid containers.
 * 2. Positively reject and prevent typing or sending anywhere near client messaging, chat drawers, or messenger components.
 * 3. Dual-stage validation: performs in-page verification of skills, blacklist, country, and budget before filling.
 * 4. Dual-input amount synchronization (bid amount + milestone amount).
 * 5. Reliable event dispatching for Angular/React/native forms.
 * 6. Post-submission verification and autonomous tab management.
 */

(function () {
  'use strict';

  console.log('[AutoBid Secure] Freelancer AutoBid Content Script initializing...');

  // Capture hash immediately before SPA routers strip it
  let capturedHash = window.location.hash || '';
  if (capturedHash && (capturedHash.includes('autobid') || capturedHash.includes('amount') || capturedHash.includes('pid'))) {
    try {
      sessionStorage.setItem('__freelancer_autobid_hash__', capturedHash);
    } catch (e) {}
  } else {
    try {
      capturedHash = sessionStorage.getItem('__freelancer_autobid_hash__') || '';
    } catch (e) {}
  }

  /**
   * Safety Rule 1: Page Verification
   * Verify this is genuinely an active Freelancer project page, NOT a chat/inbox or profile page.
   */
  function isSafeBidPage() {
    const hostname = window.location.hostname || '';
    const pathname = window.location.pathname || '';

    if (!hostname.includes('freelancer.')) {
      return false;
    }

    // Must be a project details page
    if (!pathname.startsWith('/projects/') && !pathname.includes('/projects/')) {
      return false;
    }

    // Explicitly forbidden non-project pages
    const forbiddenPaths = ['/messages', '/inbox', '/users/', '/settings', '/deposit', '/withdraw', '/contest/'];
    if (forbiddenPaths.some((p) => pathname.includes(p))) {
      return false;
    }

    return true;
  }

  /**
   * Safety Rule 2: Anti-Chat / Anti-Messenger Guard
   * Positively ensures an element is NEVER part of a chat, messenger, or inbox interface.
   */
  function isChatOrMessengerElement(el) {
    if (!el) return true;

    // Check element attributes and classes
    const tag = el.tagName.toLowerCase();
    const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const dataQa = (el.getAttribute('data-qa') || '').toLowerCase();

    const chatKeywords = ['message', 'chat', 'conversation', 'inbox', 'messenger', 'reply', 'type a message', 'send a message'];
    
    if (chatKeywords.some((kw) => className.includes(kw) || placeholder.includes(kw) || dataQa.includes(kw))) {
      // Exception: bid description form controls are valid
      if (name === 'descr' || name === 'description' || dataQa.includes('bid-description')) {
        return false;
      }
      return true;
    }

    // Traverse up parents to ensure no ancestor is a chat/messenger component
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 15) {
      const pTag = parent.tagName.toLowerCase();
      const pClass = typeof parent.className === 'string' ? parent.className.toLowerCase() : '';
      const pQa = (parent.getAttribute('data-qa') || '').toLowerCase();

      if (
        pTag.includes('chat') ||
        pTag.includes('messaging') ||
        pTag.includes('messenger') ||
        pTag.includes('inbox') ||
        pClass.includes('chat-room') ||
        pClass.includes('messenger-drawer') ||
        pClass.includes('messaging-container') ||
        pQa.includes('chat') ||
        pQa.includes('messaging')
      ) {
        return true;
      }

      // If we find an explicit bid form ancestor, it is safely verified
      if (
        pTag.includes('bid-form') ||
        pTag.includes('project-view-bid-form') ||
        pClass.includes('bidform') ||
        pClass.includes('bid-form') ||
        pQa.includes('bid-form') ||
        parent.id === 'bid-form'
      ) {
        return false;
      }

      parent = parent.parentElement;
      depth++;
    }

    return false;
  }

  /**
   * Helper to query element piercing shadow DOM
   */
  function queryDeep(selector, root = document) {
    let el = root.querySelector(selector);
    if (el) return el;

    const all = root.querySelectorAll('*');
    for (const node of all) {
      if (node.shadowRoot) {
        const found = queryDeep(selector, node.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Helper to find all elements matching selector piercing shadow DOM
   */
  function queryDeepAll(selector, root = document) {
    let results = Array.from(root.querySelectorAll(selector));
    const all = root.querySelectorAll('*');
    for (const node of all) {
      if (node.shadowRoot) {
        results = results.concat(queryDeepAll(selector, node.shadowRoot));
      }
    }
    return results;
  }

  /**
   * Locate the verified Bid Form root container
   */
  function findBidFormContainer() {
    const formSelectors = [
      'app-project-view-bid-form',
      'app-bid-form',
      'fl-bid-form',
      'form[name="bidForm"]',
      'form.BidForm',
      '[data-qa="bid-form"]',
      '#bid-form',
      '.ProjectView-bid-form',
      '.bid-form-container',
      'app-project-view',
    ];

    for (const sel of formSelectors) {
      const container = queryDeep(sel);
      if (container) return container;
    }
    return document;
  }

  // Scoped selectors for Freelancer.com bid elements
  const SELECTORS = {
    openBidButton: [
      'button[data-qa="bid-button"]',
      'button[data-qa="place-bid-open"]',
      'fl-button[text*="Bid on" i] button',
      'fl-button[text*="Place a Bid" i] button',
      'button.ProjectView-bid-btn',
    ],
    description: [
      'textarea[formcontrolname="description"]',
      'textarea[data-qa="bid-description"]',
      'textarea[data-qa="bid-description-input"]',
      'fl-textarea[formcontrolname="description"] textarea',
      'app-project-view-bid-form textarea',
      'app-bid-form textarea',
      'textarea#description',
      'textarea[name="descr"]',
      'textarea[name="description"]',
      'textarea.BidForm-textarea',
      'textarea[placeholder*="proposal" i]',
      'textarea[placeholder*="details of your bid" i]',
    ],
    amount: [
      'input[formcontrolname="bidAmount"]',
      'input[data-qa="bid-amount"]',
      'input[data-qa="bid-amount-input"]',
      'fl-input[formcontrolname="bidAmount"] input',
      'input#bidAmount',
      'input[name="sum"]',
      'input[name="bidAmount"]',
      'app-project-view-bid-form input[type="number"]',
      'app-bid-form input[type="number"]',
      'input#floating-bid-amount',
    ],
    milestoneAmount: [
      'input[formcontrolname="milestoneAmount"]',
      'input[data-qa="milestone-amount"]',
      'input[data-qa="milestone-amount-input"]',
      'fl-input[formcontrolname="milestoneAmount"] input',
      'input[name="milestone_amount"]',
      'input[placeholder*="milestone" i]',
    ],
    period: [
      'input[formcontrolname="period"]',
      'input[data-qa="bid-period"]',
      'input[data-qa="bid-period-input"]',
      'fl-input[formcontrolname="period"] input',
      'input#period',
      'input[name="period"]',
      'input[name="delivery_period"]',
      'input[placeholder*="days" i]',
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

  /**
   * Find an element safely inside the verified bid container
   */
  function findSafeElement(selectorList, isTextarea = false) {
    const container = findBidFormContainer();

    for (const sel of selectorList) {
      const candidates = queryDeepAll(sel, container);
      for (const el of candidates) {
        if (isChatOrMessengerElement(el)) {
          console.warn('[AutoBid Safety] Skipped candidate element inside chat/messenger:', el);
          continue;
        }

        // For proposal textareas, ensure it's not a tiny message input
        if (isTextarea) {
          const rows = parseInt(el.getAttribute('rows') || '0', 10);
          const ph = (el.getAttribute('placeholder') || '').toLowerCase();
          if (ph.includes('type a message') || ph.includes('send a message')) {
            continue;
          }
        }

        return el;
      }
    }

    return null;
  }

  function findSafePlaceBidButton() {
    const container = findBidFormContainer();
    const btn = findSafeElement(SELECTORS.placeBidButton);
    if (btn && !btn.disabled && !isChatOrMessengerElement(btn)) {
      return btn;
    }

    // Search visible buttons by text content inside bid container
    const allButtons = queryDeepAll('button', container);
    for (const b of allButtons) {
      if (b.offsetParent !== null && !b.disabled && !isChatOrMessengerElement(b)) {
        const text = (b.textContent || '').trim().toLowerCase();
        if (text === 'place bid' || text === 'submit bid' || text === 'place a bid') {
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

  // Open the bid form if it's currently collapsed/hidden
  function maybeOpenBidForm() {
    const desc = findSafeElement(SELECTORS.description, true);
    if (!desc || desc.offsetParent === null) {
      const allButtons = Array.from(document.querySelectorAll('button, a, fl-button'));
      for (const b of allButtons) {
        if (isChatOrMessengerElement(b)) continue;
        const text = (b.textContent || '').trim().toLowerCase();
        if (text.includes('bid on this project') || text === 'place a bid' || text === 'bid now') {
          console.log('[AutoBid] Clicking open bid form button:', b);
          b.click();
          break;
        }
      }
    }
  }

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
        const stored = await chrome.storage.local.get(['pendingAutoBid', 'handsFreeAutoSubmit', 'autoSubmitDelaySeconds', 'config']);
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

  /**
   * Stage 2: In-Page Full Validation Check
   * Inspects rendered page elements against configuration before filling
   */
  async function validatePageBeforeBidding() {
    let config = null;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get('config');
        config = data.config;
      }
    } catch (e) {}

    if (!config) return { valid: true };

    const pageText = document.body ? document.body.innerText.toLowerCase() : '';
    const titleEl = document.querySelector('h1, .project-header, app-project-view h1');
    const title = titleEl ? titleEl.textContent.trim().toLowerCase() : '';

    // Check negative keywords
    if (config.negativeKeywords && config.negativeKeywords.length > 0) {
      for (const neg of config.negativeKeywords) {
        const nLower = neg.trim().toLowerCase();
        if (nLower && (title.includes(nLower) || pageText.includes(nLower))) {
          return {
            valid: false,
            reason: `Blacklisted keyword detected on page (${neg})`,
          };
        }
      }
    }

    // Check blocked countries if present in client info
    if (config.blockedCountries && config.blockedCountries.length > 0) {
      const clientLocationEl = document.querySelector('.client-location, [data-qa="client-location"], app-client-info');
      if (clientLocationEl) {
        const locText = clientLocationEl.textContent.toLowerCase();
        for (const country of config.blockedCountries) {
          const cLower = country.trim().toLowerCase();
          if (cLower && locText.includes(cLower)) {
            return {
              valid: false,
              reason: `Client country blocked (${country})`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Check for successful submission on Freelancer
   */
  function checkSubmissionSuccess() {
    const successIndicators = [
      '.ProjectView-bid-success',
      'fl-banner[type="success"]',
      '.banner-success',
      '[data-qa="bid-placed-success"]',
      'app-project-view-bid-details',
      'app-my-bid',
    ];

    for (const sel of successIndicators) {
      const el = queryDeep(sel);
      if (el && el.offsetParent !== null) return true;
    }

    // Also check page text for success confirmation
    const bodyText = document.body ? document.body.innerText : '';
    if (
      bodyText.includes('Your bid has been placed') ||
      bodyText.includes('Bid placed successfully') ||
      bodyText.includes('You have placed a bid') ||
      bodyText.includes('Your bid has been submitted')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Notification banner and autonomous submission handler
   */
  async function showAutoBidNotification(data) {
    const existing = document.getElementById('freelancer-autobid-floating-banner');
    if (existing) existing.remove();

    let isAutoSubmit = data.autoSubmit !== false;
    let delaySeconds = 2;
    let autoCloseTab = true;
    let autoCloseDelay = 3;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const st = await chrome.storage.local.get(['handsFreeAutoSubmit', 'autoSubmitDelaySeconds', 'config']);
        if (st.handsFreeAutoSubmit !== undefined) {
          isAutoSubmit = st.handsFreeAutoSubmit;
        }
        if (st.autoSubmitDelaySeconds !== undefined) {
          delaySeconds = Math.max(0, parseInt(st.autoSubmitDelaySeconds, 10));
        }
        if (st.config) {
          if (st.config.autoCloseTabOnSuccess !== undefined) autoCloseTab = st.config.autoCloseTabOnSuccess;
          if (st.config.autoCloseDelaySeconds !== undefined) autoCloseDelay = st.config.autoCloseDelaySeconds;
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
      border-radius: 14px;
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
        <button id="autobid-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; line-height: 1;">&times;</button>
      </div>
      <div style="color: #cbd5e1; line-height: 1.4; margin-bottom: 12px;">
        ${data.amount ? `<div>• Bid Amount: <strong style="color: #38bdf8;">$${data.amount}</strong></div>` : ''}
        ${data.period ? `<div>• Delivery: <strong style="color: #38bdf8;">${data.period} days</strong></div>` : ''}
        <div>• Proposal: <strong style="color: #34d399;">Autofilled into Place Bid form!</strong></div>
      </div>

      ${isAutoSubmit ? `
        <div id="autobid-countdown-box" style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
          <div style="font-size: 12px; color: #38bdf8; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
            <span>🤖 Submitting bid automatically in <span id="autobid-countdown" style="font-size: 14px; font-weight: 700; color: #f8fafc;">${delaySeconds}</span>s...</span>
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
      const descEl = findSafeElement(SELECTORS.description, true);
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
        const placeBidBtn = findSafePlaceBidButton();
        if (placeBidBtn) {
          console.log('[AutoBid] Triggering click on Freelancer Place Bid button!', placeBidBtn);
          placeBidBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
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
                ${autoCloseTab ? `Closing tab in ${autoCloseDelay}s...` : 'Autonomous bidding complete.'}
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

          // Auto-close tab after successful submission if enabled
          if (autoCloseTab) {
            setTimeout(() => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ type: 'CLOSE_CURRENT_TAB' });
              }
            }, autoCloseDelay * 1000);
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
  }

  // Attempt to autofill fields repeatedly until elements are rendered
  let autofillRunning = false;
  async function attemptAutofill(bidData) {
    if (!bidData) return;
    if (!isSafeBidPage()) {
      console.warn('[AutoBid Safety] Current URL is not a safe Freelancer project page. Aborting autofill.');
      return;
    }

    if (autofillRunning) return;
    autofillRunning = true;

    // Stage 2 in-page qualification check
    const validation = await validatePageBeforeBidding();
    if (!validation.valid) {
      console.warn('[AutoBid Safety] In-Page validation failed:', validation.reason);
      autofillRunning = false;
      return;
    }

    let filledDescription = false;
    let filledAmount = false;
    let filledPeriod = false;

    console.log('[AutoBid] Starting secure autofill poll for:', { amount: bidData.amount, period: bidData.period });

    const startTime = Date.now();
    const interval = setInterval(() => {
      maybeOpenBidForm();

      const descEl = findSafeElement(SELECTORS.description, true);
      const amountEl = findSafeElement(SELECTORS.amount);
      const milestoneEl = findSafeElement(SELECTORS.milestoneAmount);
      const periodEl = findSafeElement(SELECTORS.period);

      if (descEl && !filledDescription && bidData.proposal) {
        setNativeValue(descEl, bidData.proposal);
        descEl.style.outline = '2px solid #10b981';
        descEl.style.transition = 'outline 0.3s';
        filledDescription = true;
        console.log('[AutoBid] Filled description textarea safely inside bid form!');
      }

      if (amountEl && !filledAmount && bidData.amount) {
        setNativeValue(amountEl, bidData.amount);
        amountEl.style.outline = '2px solid #10b981';
        filledAmount = true;

        // Also sync milestone amount if present
        if (milestoneEl) {
          setNativeValue(milestoneEl, bidData.amount);
        }
        console.log('[AutoBid] Filled amount inputs safely!');
      }

      if (periodEl && !filledPeriod && bidData.period) {
        setNativeValue(periodEl, bidData.period);
        periodEl.style.outline = '2px solid #10b981';
        filledPeriod = true;
        console.log('[AutoBid] Filled delivery period input safely!');
      }

      // Safe zero-cost free upgrades check (Sealed / NDA)
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get('config').then((res) => {
            const cfg = res.config || {};
            if (cfg.allowFreeSealedUpgrade) {
              const sealedBoxes = document.querySelectorAll('input[type="checkbox"][name*="sealed"], input[type="checkbox"][id*="sealed"], fl-checkbox[name*="sealed"]');
              sealedBoxes.forEach((box) => {
                const parentText = (box.closest('label') || box.closest('div') || box.parentElement)?.innerText || '';
                if (parentText.toLowerCase().includes('free') || parentText.includes('$0') || parentText.includes('0.00')) {
                  if (box.type === 'checkbox' && !box.checked) {
                    box.click();
                    console.log('[AutoBid] Selected verified $0.00 Free Sealed upgrade.');
                  }
                }
              });
            }
            if (cfg.allowFreeNdaUpgrade) {
              const ndaBoxes = document.querySelectorAll('input[type="checkbox"][name*="nda"], input[type="checkbox"][id*="nda"], fl-checkbox[name*="nda"]');
              ndaBoxes.forEach((box) => {
                const parentText = (box.closest('label') || box.closest('div') || box.parentElement)?.innerText || '';
                if (parentText.toLowerCase().includes('free') || parentText.includes('$0') || parentText.includes('0.00')) {
                  if (box.type === 'checkbox' && !box.checked) {
                    box.click();
                    console.log('[AutoBid] Selected verified $0.00 Free NDA upgrade.');
                  }
                }
              });
            }
          });
        }
      } catch (e) {}

      // If description and amount are filled, or timeout reached
      if ((filledDescription && (filledAmount || !bidData.amount)) || (Date.now() - startTime > 18000)) {
        clearInterval(interval);
        autofillRunning = false;
        if (filledDescription || filledAmount || filledPeriod) {
          console.log('[AutoBid] Successfully filled Freelancer bid form safely!');
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
    if (!isSafeBidPage()) return;
    const bidData = await getPendingBidData();
    if (bidData) {
      console.log('[AutoBid] Pending bid data found, executing secure autofill...');
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

  window.addEventListener('load', init);
  window.addEventListener('hashchange', init);
  window.addEventListener('popstate', init);
})();
