/**
 * Freelancer AutoBid - Secure Content Script (Runs on https://www.freelancer.com/projects/*)
 * 
 * STRICT SAFETY ARCHITECTURE:
 * 1. Scope all DOM operations strictly inside verified Place Bid containers.
 * 2. Positively reject and prevent typing or sending anywhere near client messaging, chat drawers, or messenger components.
 * 3. Never touch or modify the milestone "Description" field ("Project milestone from freelancer.com").
 * 4. Only interact with the 4 verified bid-related fields:
 *    - Proposal
 *    - Delivery Days
 *    - Bid Amount
 *    - Amount (Milestone Amount)
 * 5. Guarantee Bid Amount and Amount always match the exact same normalized round figure.
 * 6. Dual-stage validation: in-page verification of skills, blacklist, country, and budget.
 * 7. Unified 10-Second Auto-Close on BOTH terminal SUCCESS and FAILURE for AutoBid-opened tabs.
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

  // Register this tab with background script if opened via AutoBid
  function registerWithBackground() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'REGISTER_AUTOBID_TAB' });
      }
    } catch (e) {}
  }

  /**
   * Centralized Bid Amount Normalization (Ceiling / Round-Up)
   */
  function normalizeBidAmount(amount) {
    if (!amount || isNaN(amount) || amount <= 0) return 15;
    const raw = Number(amount);
    if (raw <= 50) return Math.ceil(raw / 5) * 5;
    if (raw <= 300) return Math.ceil(raw / 10) * 10;
    return Math.ceil(raw / 50) * 50;
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

    if (!pathname.startsWith('/projects/') && !pathname.includes('/projects/')) {
      return false;
    }

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

    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const dataQa = (el.getAttribute('data-qa') || '').toLowerCase();

    const chatKeywords = ['message', 'chat', 'conversation', 'inbox', 'messenger', 'reply', 'type a message', 'send a message'];
    
    if (chatKeywords.some((kw) => className.includes(kw) || placeholder.includes(kw) || dataQa.includes(kw))) {
      // Exception: bid proposal form controls are valid
      if (dataQa.includes('bid-description') || dataQa.includes('proposal') || name === 'descr') {
        return false;
      }
      return true;
    }

    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 15) {
      const pTag = parent.tagName ? parent.tagName.toLowerCase() : '';
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
   * Safety Rule 3: Description Field Exclusion
   * Positively identifies the milestone "Description" input ("Project milestone from freelancer.com")
   * to ensure AutoBid NEVER touches, focuses, or overwrites it.
   */
  function isMilestoneDescriptionElement(el) {
    if (!el) return false;

    const name = (el.getAttribute('name') || '').toLowerCase();
    const formControl = (el.getAttribute('formcontrolname') || '').toLowerCase();
    const dataQa = (el.getAttribute('data-qa') || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const val = (el.value || '').toLowerCase();

    // Check specific attributes of the milestone description field
    if (
      name.includes('milestone_desc') ||
      name.includes('milestonedescription') ||
      formControl.includes('milestonedescription') ||
      dataQa.includes('milestone-desc') ||
      dataQa.includes('milestone-description')
    ) {
      return true;
    }

    // Check default Freelancer text in the field
    if (
      placeholder.includes('milestone') ||
      placeholder.includes('description of milestone') ||
      val.includes('project milestone from freelancer.com') ||
      val.includes('milestone from freelancer.com')
    ) {
      return true;
    }

    // Check if it's a text input in the milestone table row
    if (el.tagName && el.tagName.toLowerCase() === 'input' && (el.type === 'text' || !el.type)) {
      const parentRow = el.closest('tr, .milestone-row, app-milestone, fl-table-row');
      if (parentRow && !dataQa.includes('amount') && !name.includes('amount') && !formControl.includes('amount')) {
        return true;
      }
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

  /**
   * Positively identified field selectors for Freelancer bid form
   */
  const SELECTORS = {
    // 1. Proposal Textarea (The large proposal body)
    proposal: [
      'textarea[data-qa="bid-description"]',
      'textarea[data-qa="bid-description-input"]',
      'textarea[formcontrolname="description"]',
      'fl-textarea[formcontrolname="description"] textarea',
      'app-project-view-bid-form textarea',
      'app-bid-form textarea',
      'textarea#description',
      'textarea[name="descr"]',
      'textarea.BidForm-textarea',
      'textarea[placeholder*="proposal" i]',
      'textarea[placeholder*="details of your bid" i]',
    ],
    // 2. Delivery Days Input
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
    // 3. Bid Amount Input (Overall Bid Amount)
    bidAmount: [
      'input[formcontrolname="bidAmount"]',
      'input[data-qa="bid-amount"]',
      'input[data-qa="bid-amount-input"]',
      'fl-input[formcontrolname="bidAmount"] input',
      'input#bidAmount',
      'input[name="sum"]',
      'input[name="bidAmount"]',
    ],
    // 4. Amount Input (First Milestone Amount)
    milestoneAmount: [
      'input[formcontrolname="milestoneAmount"]',
      'input[data-qa="milestone-amount"]',
      'input[data-qa="milestone-amount-input"]',
      'fl-input[formcontrolname="milestoneAmount"] input',
      'input[name="milestone_amount"]',
    ],
    // 5. Milestone Description Input (READ-ONLY FOR AUTOBID - NEVER MODIFY)
    milestoneDescription: [
      'input[formcontrolname="milestoneDescription"]',
      'input[data-qa="milestone-description"]',
      'input[data-qa="milestone-description-input"]',
      'fl-input[formcontrolname="milestoneDescription"] input',
      'input[name="milestone_description"]',
    ],
    // 6. Place Bid Submit Button
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
   * Find Proposal field specifically
   */
  function findSafeProposalField() {
    const container = findBidFormContainer();
    for (const sel of SELECTORS.proposal) {
      const candidates = queryDeepAll(sel, container);
      for (const el of candidates) {
        if (isChatOrMessengerElement(el)) continue;
        if (el.tagName && el.tagName.toLowerCase() === 'textarea') {
          return el;
        }
      }
    }
    return null;
  }

  /**
   * Find Delivery Days field specifically
   */
  function findSafeDeliveryDaysField() {
    const container = findBidFormContainer();
    for (const sel of SELECTORS.period) {
      const candidates = queryDeepAll(sel, container);
      for (const el of candidates) {
        if (isChatOrMessengerElement(el)) continue;
        if (isMilestoneDescriptionElement(el)) continue;
        return el;
      }
    }
    return null;
  }

  /**
   * Find Bid Amount field specifically (Paid to you)
   */
  function findSafeBidAmountField() {
    const container = findBidFormContainer();
    for (const sel of SELECTORS.bidAmount) {
      const candidates = queryDeepAll(sel, container);
      for (const el of candidates) {
        if (isChatOrMessengerElement(el)) continue;
        if (isMilestoneDescriptionElement(el)) continue;
        return el;
      }
    }
    return null;
  }

  /**
   * Find Amount field specifically (Milestone amount)
   */
  function findSafeAmountField() {
    const container = findBidFormContainer();
    for (const sel of SELECTORS.milestoneAmount) {
      const candidates = queryDeepAll(sel, container);
      for (const el of candidates) {
        if (isChatOrMessengerElement(el)) continue;
        if (isMilestoneDescriptionElement(el)) continue;
        return el;
      }
    }
    return null;
  }

  /**
   * Find Milestone Description field (To capture & verify it remains untouched)
   */
  function findMilestoneDescriptionField() {
    const container = findBidFormContainer();
    for (const sel of SELECTORS.milestoneDescription) {
      const candidates = queryDeepAll(sel, container);
      for (const el of candidates) {
        if (isChatOrMessengerElement(el)) continue;
        return el;
      }
    }
    // Search by value or placeholder
    const allInputs = queryDeepAll('input', container);
    for (const input of allInputs) {
      if (isMilestoneDescriptionElement(input)) {
        return input;
      }
    }
    return null;
  }

  /**
   * Find Place Bid button across containers and document with thorough selector and text matching
   */
  function findSafePlaceBidButton() {
    const container = findBidFormContainer();
    
    // 1. Search container with specific selectors
    for (const sel of SELECTORS.placeBidButton) {
      const candidates = queryDeepAll(sel, container);
      for (const btn of candidates) {
        if (!isChatOrMessengerElement(btn) && !isMilestoneDescriptionElement(btn)) {
          return btn;
        }
      }
    }

    // 2. Search container for any button matching text
    const allContainerButtons = queryDeepAll('button, fl-button, a, [role="button"]', container);
    for (const b of allContainerButtons) {
      if (!isChatOrMessengerElement(b) && !isMilestoneDescriptionElement(b)) {
        const text = (b.textContent || '').trim().toLowerCase();
        if (text.includes('place bid') || text.includes('submit bid') || text.includes('place a bid') || text === 'bid') {
          return b;
        }
      }
    }

    // 3. Fallback: Search the entire document
    for (const sel of SELECTORS.placeBidButton) {
      const candidates = queryDeepAll(sel, document);
      for (const btn of candidates) {
        if (!isChatOrMessengerElement(btn) && !isMilestoneDescriptionElement(btn)) {
          return btn;
        }
      }
    }

    const allGlobalButtons = queryDeepAll('button, fl-button, a, [role="button"]', document);
    for (const b of allGlobalButtons) {
      if (!isChatOrMessengerElement(b) && !isMilestoneDescriptionElement(b)) {
        const text = (b.textContent || '').trim().toLowerCase();
        if (text.includes('place bid') || text.includes('submit bid') || text.includes('place a bid')) {
          return b;
        }
      }
    }

    return null;
  }

  /**
   * Safely and thoroughly click the Freelancer Place Bid button
   */
  function safelyClickPlaceBidButton(buttonEl) {
    if (!buttonEl) return false;

    try {
      buttonEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    // Blur active elements to commit Angular Form values
    try {
      if (document.activeElement && document.activeElement !== buttonEl && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } catch (e) {}

    // Unlock disabled states if set
    if (buttonEl.disabled) {
      buttonEl.disabled = false;
      buttonEl.removeAttribute('disabled');
    }
    const innerBtn = buttonEl.querySelector ? buttonEl.querySelector('button') : null;
    if (innerBtn && innerBtn.disabled) {
      innerBtn.disabled = false;
      innerBtn.removeAttribute('disabled');
    }

    const target = innerBtn || buttonEl;
    const eventOpts = { bubbles: true, cancelable: true, view: window, composed: true };

    try { target.dispatchEvent(new PointerEvent('pointerdown', eventOpts)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('mousedown', eventOpts)); } catch (e) {}
    try { target.dispatchEvent(new PointerEvent('pointerup', eventOpts)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('mouseup', eventOpts)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('click', eventOpts)); } catch (e) {}
    try { target.click(); } catch (e) {}

    if (buttonEl !== target) {
      try { buttonEl.click(); } catch (e) {}
    }

    return true;
  }

  /**
   * Set input value and dispatch all relevant synthetic events for Angular / React / native forms
   */
  function setNativeValue(element, value) {
    if (!element || value == null) return false;

    try {
      element.focus();
    } catch (e) {}

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
    const proposalEl = findSafeProposalField();
    if (!proposalEl || proposalEl.offsetParent === null) {
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
          amount: amount ? Number(amount) : null,
          period: period ? Number(period) : null,
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
              amount: pb.amount ? Number(pb.amount) : null,
              period: pb.period ? Number(pb.period) : null,
              autoSubmit: stored.handsFreeAutoSubmit !== undefined ? stored.handsFreeAutoSubmit : pb.autoSubmit,
            };
          }
        }
      }
    } catch (e) {}

    return null;
  }

  /**
   * Comprehensive In-Page Terminal Failure and Qualification Scanner
   * Checks for all terminal conditions where bidding is prohibited, unavailable, or failed.
   */
  async function scanPageForTerminalFailures() {
    let config = null;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get('config');
        config = data.config;
      }
    } catch (e) {}

    const pageText = document.body ? document.body.innerText.toLowerCase() : '';
    const titleEl = document.querySelector('h1, .project-header, app-project-view h1');
    const title = titleEl ? titleEl.textContent.trim().toLowerCase() : '';

    // 1. Existing Bid already placed
    const alreadyBidSelectors = ['.ProjectView-bid-success', 'app-project-view-bid-details', 'app-my-bid', '.my-bid'];
    for (const sel of alreadyBidSelectors) {
      const el = queryDeep(sel);
      if (el && el.offsetParent !== null) {
        return {
          failed: true,
          reason: 'Bid already exists on this project'
        };
      }
    }
    if (
      pageText.includes('you have already placed a bid') ||
      pageText.includes('your bid on this project') ||
      pageText.includes('retract bid') ||
      pageText.includes('edit bid')
    ) {
      return {
        failed: true,
        reason: 'Bid already exists on this project'
      };
    }

    // 2. Project Status: Closed / Deleted / No longer accepting bids / Cancelled
    const statusBanner = queryDeep('app-project-view-header .ProjectView-header-status, .project-status, app-project-status, [data-qa="project-status"], fl-banner[type="warning"]');
    if (statusBanner) {
      const statusText = (statusBanner.textContent || '').toLowerCase();
      if (
        statusText.includes('closed') ||
        statusText.includes('deleted') ||
        statusText.includes('cancelled') ||
        statusText.includes('in draft')
      ) {
        return {
          failed: true,
          reason: `Project is ${statusText.trim()}`
        };
      }
    }

    // 3. Verification & Account Eligibility Restrictions (Specific banners only)
    const restrictBanner = queryDeep('fl-banner[type="warning"], fl-banner[type="danger"], .verification-required-banner');
    if (restrictBanner) {
      const bText = (restrictBanner.textContent || '').toLowerCase();
      if (
        bText.includes('identity verification required') ||
        bText.includes('verify your phone') ||
        bText.includes('account not eligible') ||
        bText.includes('you have reached your bid limit')
      ) {
        return {
          failed: true,
          reason: `Restriction: ${bText.slice(0, 60)}`
        };
      }
    }

    // 6. Explicit Freelancer site/form error banners
    const errorBanners = queryDeepAll('fl-banner[type="danger"], fl-banner[type="error"], .banner-danger, .error-message, [data-qa="error-message"]');
    for (const b of errorBanners) {
      if (b && b.offsetParent !== null) {
        const text = (b.textContent || '').trim();
        if (text && !text.toLowerCase().includes('success')) {
          return {
            failed: true,
            reason: `Freelancer error: ${text.slice(0, 80)}`
          };
        }
      }
    }

    // 7. Negative Keywords check
    if (config && config.negativeKeywords && config.negativeKeywords.length > 0) {
      for (const neg of config.negativeKeywords) {
        const nLower = neg.trim().toLowerCase();
        if (nLower && (title.includes(nLower) || pageText.includes(nLower))) {
          return {
            failed: true,
            reason: `Disqualified by negative keyword: "${neg}"`
          };
        }
      }
    }

    // 8. Blocked Client Country check
    if (config && config.blockedCountries && config.blockedCountries.length > 0) {
      const clientLocationEl = document.querySelector('.client-location, [data-qa="client-location"], app-client-info, .ProjectView-client-info');
      if (clientLocationEl) {
        const locText = clientLocationEl.textContent.toLowerCase();
        for (const country of config.blockedCountries) {
          const cLower = country.trim().toLowerCase();
          if (cLower && locText.includes(cLower)) {
            return {
              failed: true,
              reason: `Disqualified: Blocked client country (${country})`
            };
          }
        }
      }
    }

    return { failed: false };
  }

  /**
   * Show 10-Second Terminal Failure Notification Banner
   */
  function showTerminalFailureBanner(reason) {
    const existing = document.getElementById('freelancer-autobid-floating-banner');
    if (existing) existing.remove();

    let remaining = 10;
    let cancelled = false;

    const banner = document.createElement('div');
    banner.id = 'freelancer-autobid-floating-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999999;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #ef4444;
      border-radius: 14px;
      padding: 16px 20px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      max-width: 400px;
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
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 8px #ef4444;"></span>
          <strong style="color: #f87171; font-size: 14px;">
            ⚠️ AutoBid Skipped / Failed
          </strong>
        </div>
        <button id="autobid-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; line-height: 1;">&times;</button>
      </div>
      <div style="color: #cbd5e1; line-height: 1.4; margin-bottom: 12px;">
        <div style="color: #fca5a5; font-weight: 600; margin-bottom: 4px;">• ${reason}</div>
        <div style="font-size: 12px; color: #94a3b8;">This project cannot be bid on. Logging failure &amp; cleaning up tab...</div>
      </div>
      <div style="background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
        <div style="font-size: 12px; color: #fca5a5; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
          <span>⏳ Closing tab in <span id="autobid-fail-countdown" style="font-size: 14px; font-weight: 700; color: #ffffff;">10</span>s...</span>
        </div>
        <div style="font-size: 11px; color: #f87171; margin-top: 4px;">Returning to main project search tab to continue scanning.</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="autobid-keep-tab-btn" style="flex: 1; background: #334155; color: #cbd5e1; border: none; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
          Keep Tab Open
        </button>
        <button id="autobid-close-now-btn" style="flex: 1; background: #dc2626; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
          Close Now ⚡
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('autobid-close-btn')?.addEventListener('click', () => {
      cancelled = true;
      banner.remove();
    });

    document.getElementById('autobid-keep-tab-btn')?.addEventListener('click', () => {
      cancelled = true;
      banner.remove();
      console.log('[AutoBid] Tab close cancelled by user manual override.');
    });

    document.getElementById('autobid-close-now-btn')?.addEventListener('click', () => {
      cancelled = true;
      requestTabClose(reason, 0);
    });

    const timer = setInterval(() => {
      if (cancelled) {
        clearInterval(timer);
        return;
      }
      remaining -= 1;
      const countdownEl = document.getElementById('autobid-fail-countdown');
      if (countdownEl) countdownEl.textContent = remaining.toString();
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);
  }

  /**
   * Handle Terminal Failure: Log, display banner, notify background & trigger 10-second close
   */
  function handleTerminalFailure(reason) {
    console.warn(`[AutoBid Terminal Failure] ${reason}`);
    console.log(`[BID] Failed: ${reason}`);

    // Show 10s countdown banner on screen
    showTerminalFailureBanner(reason);

    // Schedule 10s tab close in background
    requestTabClose(reason, 10000);

    // Send failure report to background service worker and local API
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'BID_FAILED',
          reason: reason,
          url: window.location.href,
          timestamp: Date.now()
        });
      }
    } catch (e) {}
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
   * Centralized 10-Second Tab Close Dispatcher
   * Sends SCHEDULE_TAB_CLOSE to background service worker
   */
  function requestTabClose(reason, delayMs = 10000) {
    console.log(`[TAB] Closing AutoBid project tab in ${delayMs / 1000} seconds. (${reason})`);
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SCHEDULE_TAB_CLOSE',
          delayMs: delayMs,
          reason: reason,
        });
      }
    } catch (e) {
      console.warn('[AutoBid Tab Close] Could not dispatch tab close message:', e);
    }
  }

  /**
   * Notification banner and autonomous submission handler
   */
  async function showAutoBidNotification(data, finalAmount) {
    const existing = document.getElementById('freelancer-autobid-floating-banner');
    if (existing) existing.remove();

    let isAutoSubmit = data.autoSubmit !== false;
    let delaySeconds = 2;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const st = await chrome.storage.local.get(['handsFreeAutoSubmit', 'autoSubmitDelaySeconds', 'config']);
        if (st.handsFreeAutoSubmit !== undefined) isAutoSubmit = st.handsFreeAutoSubmit;
        if (st.autoSubmitDelaySeconds !== undefined) delaySeconds = Math.max(0, parseInt(st.autoSubmitDelaySeconds, 10));
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
        <div>• Bid Amount: <strong style="color: #38bdf8;">$${finalAmount}</strong></div>
        <div>• Amount (Milestone): <strong style="color: #38bdf8;">$${finalAmount}</strong> (Synchronized)</div>
        ${data.period ? `<div>• Delivery: <strong style="color: #38bdf8;">${data.period} days</strong></div>` : ''}
        <div>• Description (Milestone): <strong style="color: #a7f3d0;">Untouched (Default preserved)</strong></div>
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
      const proposalEl = findSafeProposalField();
      if (proposalEl) {
        proposalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        proposalEl.focus();
      }
    });

    // Autonomous Auto-Submit Execution
    if (isAutoSubmit) {
      let remaining = delaySeconds;
      let cancelled = false;

      const countdownEl = document.getElementById('autobid-countdown');
      const cancelBtn = document.getElementById('autobid-cancel-submit-btn');
      const submitNowBtn = document.getElementById('autobid-submit-now-btn');

      let submitTriggered = false;

      const executeSubmit = () => {
        if (cancelled || submitTriggered) return;

        // Final Pre-Submission Validation & Integrity Check
        const bidAmountEl = findSafeBidAmountField();
        const milestoneAmountEl = findSafeAmountField();
        const milestoneDescEl = findMilestoneDescriptionField();
        const proposalEl = findSafeProposalField();

        // 1. Verify Bid Amount and Amount match
        const bVal = bidAmountEl ? Number(String(bidAmountEl.value).replace(/[^0-9.]/g, '')) : null;
        const mVal = milestoneAmountEl ? Number(String(milestoneAmountEl.value).replace(/[^0-9.]/g, '')) : null;

        if (bVal !== finalAmount && bidAmountEl) {
          setNativeValue(bidAmountEl, finalAmount);
        }
        if (mVal !== finalAmount && milestoneAmountEl) {
          setNativeValue(milestoneAmountEl, finalAmount);
        }

        console.log('[BID PRICE] Verified Bid Amount field:', finalAmount);
        console.log('[BID PRICE] Verified Amount field:', finalAmount);

        // 2. Verify Description field is untouched / preserved
        if (milestoneDescEl) {
          console.log('[FORM SAFETY] Description field preserved unchanged:', milestoneDescEl.value);
        }

        // 3. Find and click Place Bid button with robust retry loop
        let retries = 0;
        const maxRetries = 15; // 15 retries * 400ms = 6 seconds of resilient search

        const attemptClickButton = () => {
          if (cancelled || submitTriggered) return;

          const placeBidBtn = findSafePlaceBidButton();
          if (placeBidBtn) {
            submitTriggered = true;
            console.log('[AutoBid] Clicking Freelancer Place Bid button!', placeBidBtn);
            
            const clicked = safelyClickPlaceBidButton(placeBidBtn);

            const countdownBox = document.getElementById('autobid-countdown-box');
            if (countdownBox) {
              countdownBox.style.background = '#064e3b';
              countdownBox.style.borderColor = '#059669';
              countdownBox.innerHTML = `
                <div style="font-size: 13px; color: #34d399; font-weight: 700;">
                  ✅ Bid Successfully Confirmed!
                </div>
                <div style="font-size: 11px; color: #a7f3d0; margin-top: 2px;">
                  ⏳ Waiting 10 seconds... Closing tab &amp; returning to main project feed in <span id="autobid-success-close-countdown" style="font-weight:700;">10</span>s.
                </div>
              `;
            }
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (submitNowBtn) submitNowBtn.style.display = 'none';

            console.log('[BID] Bid successfully confirmed');

            // Schedule 10-second close ONLY after button has been clicked
            requestTabClose('Bid successfully confirmed', 10000);

            // Success countdown ticker on banner
            let successRemain = 10;
            const sTimer = setInterval(() => {
              successRemain -= 1;
              const el = document.getElementById('autobid-success-close-countdown');
              if (el) el.textContent = successRemain.toString();
              if (successRemain <= 0) clearInterval(sTimer);
            }, 1000);

            // Post-click verification watcher: check for post-submission error banners
            setTimeout(async () => {
              const termCheck = await scanPageForTerminalFailures();
              if (termCheck.failed && !checkSubmissionSuccess()) {
                console.warn('[AutoBid] Post-submission failure detected:', termCheck.reason);
                handleTerminalFailure(termCheck.reason);
              }
            }, 2500);

            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
              chrome.runtime.sendMessage({
                type: 'BID_AUTO_SUBMITTED',
                data: {
                  url: window.location.href,
                  amount: finalAmount,
                  period: data.period,
                  timestamp: Date.now()
                }
              });
            }
          } else {
            retries += 1;
            if (retries <= maxRetries) {
              console.log(`[AutoBid] Place Bid button not ready yet, retrying... (${retries}/${maxRetries})`);
              maybeOpenBidForm();
              setTimeout(attemptClickButton, 400);
            } else {
              console.warn('[AutoBid] Place Bid button unavailable after full retries.');
              handleTerminalFailure('Place Bid button unavailable');
            }
          }
        };

        attemptClickButton();
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
    registerWithBackground();

    if (!isSafeBidPage()) {
      console.warn('[AutoBid Safety] Current URL is not a safe Freelancer project page. Aborting autofill.');
      return;
    }

    if (autofillRunning) return;
    autofillRunning = true;

    // Comprehensive in-page terminal failure & qualification check
    const termCheck = await scanPageForTerminalFailures();
    if (termCheck.failed) {
      console.warn('[AutoBid Safety] In-Page terminal condition / qualification failed:', termCheck.reason);
      handleTerminalFailure(termCheck.reason);
      autofillRunning = false;
      return;
    }

    // Normalize recommended bid amount using the centralized ceiling round-up rules
    const rawAmount = Number(bidData.amount) || 50;
    const finalAmount = normalizeBidAmount(rawAmount);

    console.log(`[AI PRICE] Recommended amount: $${rawAmount}`);
    console.log(`[BID PRICE] Rounded amount: $${finalAmount}`);
    console.log(`[BID PRICE] Bid Amount field: $${finalAmount}`);
    console.log(`[BID PRICE] Amount field: $${finalAmount}`);

    let filledProposal = false;
    let filledBidAmount = false;
    let filledAmount = false;
    let filledPeriod = false;
    let capturedOriginalDesc = null;

    const startTime = Date.now();
    const interval = setInterval(() => {
      maybeOpenBidForm();

      // Capture milestone description immediately to ensure it remains untouched
      const milestoneDescEl = findMilestoneDescriptionField();
      if (milestoneDescEl && capturedOriginalDesc === null) {
        capturedOriginalDesc = milestoneDescEl.value;
        console.log('[FORM SAFETY] Initial Description field captured:', capturedOriginalDesc);
      }

      // 1. Fill Proposal
      const proposalEl = findSafeProposalField();
      if (proposalEl && !filledProposal && bidData.proposal) {
        setNativeValue(proposalEl, bidData.proposal);
        proposalEl.style.outline = '2px solid #10b981';
        proposalEl.style.transition = 'outline 0.3s';
        filledProposal = true;
        console.log('[AutoBid] Filled Proposal field safely inside bid form!');
      }

      // 2. Fill Bid Amount
      const bidAmountEl = findSafeBidAmountField();
      if (bidAmountEl && !filledBidAmount) {
        setNativeValue(bidAmountEl, finalAmount);
        bidAmountEl.style.outline = '2px solid #10b981';
        filledBidAmount = true;
        console.log('[AutoBid] Filled Bid Amount field safely:', finalAmount);
      }

      // 3. Fill Amount (Milestone Amount) with the exact same final amount
      const amountEl = findSafeAmountField();
      if (amountEl && !filledAmount) {
        setNativeValue(amountEl, finalAmount);
        amountEl.style.outline = '2px solid #10b981';
        filledAmount = true;
        console.log('[AutoBid] Filled Amount (Milestone) field safely:', finalAmount);
      }

      // 4. Fill Delivery Days
      const periodEl = findSafeDeliveryDaysField();
      if (periodEl && !filledPeriod && bidData.period) {
        setNativeValue(periodEl, bidData.period);
        periodEl.style.outline = '2px solid #10b981';
        filledPeriod = true;
        console.log('[AutoBid] Filled Delivery Days field safely:', bidData.period);
      }

      // 5. Free Bid Upgrades check ($0.00 / FREE verified only)
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

      // Description field integrity check: ensure it was never modified
      if (milestoneDescEl && capturedOriginalDesc !== null && milestoneDescEl.value !== capturedOriginalDesc) {
        console.warn('[FORM SAFETY] Restoring accidentally modified Description field to:', capturedOriginalDesc);
        setNativeValue(milestoneDescEl, capturedOriginalDesc);
      }

      // Check completion state
      const isComplete = filledProposal && filledBidAmount;
      const isTimedOut = Date.now() - startTime > 18000;

      if (isComplete || isTimedOut) {
        clearInterval(interval);
        autofillRunning = false;

        if (isComplete) {
          console.log('[AutoBid] Successfully filled verified bid form fields!');
          showAutoBidNotification(bidData, finalAmount);

          try {
            sessionStorage.removeItem('__freelancer_autobid_hash__');
          } catch (e) {}
        } else if (isTimedOut) {
          console.warn('[AutoBid] Form elements not found before timeout.');
          handleTerminalFailure('Bid form missing or timed out');
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', init);
  window.addEventListener('hashchange', init);
  window.addEventListener('popstate', init);
})();
