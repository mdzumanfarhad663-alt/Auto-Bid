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

    // A text input inside a milestone row is the description, unless its own label
    // marks it as an amount or day count. Without that check this rule swallows the
    // bid amount and delivery days fields whenever Freelancer renders them in a row.
    if (el.tagName && el.tagName.toLowerCase() === 'input' && (el.type === 'text' || !el.type)) {
      const parentRow = el.closest('tr, .milestone-row, app-milestone, fl-table-row');
      if (parentRow) {
        const context = fieldContextText(el);
        const looksLikeValueField =
          dataQa.includes('amount') ||
          name.includes('amount') ||
          formControl.includes('amount') ||
          /\b(amount|bid|budget|paid to you|days|deliver|period)\b/.test(context);
        if (!looksLikeValueField) return true;
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

  function isElementVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    } catch (e) {}
    return true;
  }

  // Angular keeps the submit button disabled until the reactive form validates, and a
  // disabled button silently swallows dispatched clicks, so this must gate every click.
  function isButtonDisabled(el) {
    if (!el) return true;
    if (el.disabled === true) return true;
    if (el.hasAttribute && (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true')) return true;
    const inner = el.querySelector ? el.querySelector('button') : null;
    if (inner && (inner.disabled === true || (inner.hasAttribute && inner.hasAttribute('disabled')))) return true;
    return false;
  }

  function normalizedText(el) {
    if (!el) return '';
    const raw = el.innerText || el.textContent || '';
    return raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
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
      'textarea#descriptionTextArea',
      'textarea[placeholder*="best candidate" i]',
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
      'input#periodInput',
      'input[placeholder*="number of days" i]',
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
      'input#bidAmountInput',
      'input[placeholder*="enter bid amount" i]',
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
      'fl-input[class*="MilestoneRequest-amount"] input',
      '.MilestoneRequest-amount input',
      'input[formcontrolname="milestoneAmount"]',
      'input[data-qa="milestone-amount"]',
      'input[data-qa="milestone-amount-input"]',
      'fl-input[formcontrolname="milestoneAmount"] input',
      'input[name="milestone_amount"]',
    ],
    // 5. Milestone Description Input (READ-ONLY FOR AUTOBID - NEVER MODIFY)
    milestoneDescription: [
      'input[placeholder*="describe your milestone" i]',
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
      'button[data-qa*="place-bid" i]',
      'button[data-uitest*="place-bid" i]',
      '[fltrackinglabel*="PlaceBid" i] button',
      '[fltrackinglabel*="PlaceBid" i]',
      '[fltrackinglabel*="SubmitBid" i] button',
      'app-project-view-bid-form button[type="submit"]',
      'app-bid-form button[type="submit"]',
      'fl-button[text*="Place Bid" i] button',
      'fl-button[text*="Place Bid" i]',
      'button.BidForm-submit',
      'form[name="bidForm"] button[type="submit"]',
      '#place-bid-btn',
    ]
  };

  const PLACE_BID_TEXTS = [
    'place bid',
    'place a bid',
    'submit bid',
    'place your bid',
    'update bid',
    'update my bid',
    'bid now',
  ];

  function looksLikePlaceBidText(text) {
    if (!text) return false;
    if (text === 'bid') return true;
    return PLACE_BID_TEXTS.some((t) => text.includes(t));
  }

  /**
   * Text that identifies an input: its own attributes plus any label wrapping it.
   * Exact selectors break whenever Freelancer renames a formcontrolname, so the
   * visible label is used as the durable fallback signal.
   */
  function fieldContextText(el) {
    if (!el) return '';
    const parts = [];

    for (const attr of ['placeholder', 'aria-label', 'name', 'formcontrolname', 'data-qa', 'id', 'title']) {
      const v = el.getAttribute ? el.getAttribute(attr) : null;
      if (v) parts.push(v);
    }

    try {
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        for (const id of labelledBy.split(/\s+/)) {
          const lbl = document.getElementById(id);
          if (lbl) parts.push(lbl.textContent || '');
        }
      }
      if (el.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (forLabel) parts.push(forLabel.textContent || '');
      }
    } catch (e) {}

    // Walk up the wrappers (fl-input, form row, label) collecting label text. Stop as soon
    // as an ancestor holds another form control, because from there up the text belongs to
    // the sibling fields too and would make every input look like every other one.
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 4) {
      if (parent.querySelectorAll('input, textarea, select').length > 1) break;
      const text = (parent.innerText || parent.textContent || '').trim();
      if (text && text.length <= 160) parts.push(text);
      parent = parent.parentElement;
      depth++;
    }

    return parts.join(' ').replace(/ /g, ' ').replace(/\s+/g, ' ').toLowerCase();
  }

  const FIELD_HINTS = {
    bidAmount: ['bid amount', 'your bid', 'paid to you', 'you will receive', 'bid on this project', 'amount'],
    milestoneAmount: ['milestone amount', 'first milestone', 'payment amount'],
    period: ['deliver', 'delivery', 'days', 'period', 'timeframe', 'duration', 'turnaround'],
  };

  /**
   * Fallback finder: scan the real inputs in the bid form and pick by label text.
   */
  function findFieldByContext(kind, exclude = []) {
    const container = findBidFormContainer();
    const hints = FIELD_HINTS[kind] || [];
    const inputs = queryDeepAll('input', container);

    const matches = [];
    for (const el of inputs) {
      if (exclude.includes(el)) continue;
      if (isChatOrMessengerElement(el)) continue;
      if (isMilestoneDescriptionElement(el)) continue;
      if (!isElementVisible(el)) continue;
      if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'hidden' || el.readOnly) continue;

      const context = fieldContextText(el);
      const hintIndex = hints.findIndex((h) => context.includes(h));
      if (hintIndex === -1) continue;

      // Earlier hints are more specific, and a number input is far more likely
      // to be the amount or day count than a free text box.
      let score = (hints.length - hintIndex) * 10;
      if (el.type === 'number') score += 5;
      matches.push({ el, score });
    }

    if (matches.length === 0) return null;
    matches.sort((a, b) => b.score - a.score);
    return matches[0].el;
  }

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
        if (!isElementVisible(el)) continue;
        return el;
      }
    }
    return findFieldByContext('period');
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
        if (!isElementVisible(el)) continue;
        return el;
      }
    }
    const periodEl = findSafeDeliveryDaysField();
    return findFieldByContext('bidAmount', periodEl ? [periodEl] : []);
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
        if (!isElementVisible(el)) continue;
        return el;
      }
    }
    // Must never collide with the bid amount or delivery days field.
    const exclude = [findSafeBidAmountField(), findSafeDeliveryDaysField()].filter(Boolean);
    return findFieldByContext('milestoneAmount', exclude);
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
  function collectPlaceBidCandidates() {
    const container = findBidFormContainer();
    const seen = new Set();
    const candidates = [];

    const consider = (el, score) => {
      if (!el || seen.has(el)) return;
      if (isChatOrMessengerElement(el) || isMilestoneDescriptionElement(el)) return;
      if (!isElementVisible(el)) return;
      seen.add(el);
      candidates.push({ el, score });
    };

    // Explicit selectors inside the bid form score highest.
    for (const sel of SELECTORS.placeBidButton) {
      for (const btn of queryDeepAll(sel, container)) consider(btn, 100);
    }
    for (const sel of SELECTORS.placeBidButton) {
      for (const btn of queryDeepAll(sel, document)) consider(btn, 70);
    }

    // Text matching. An <a> is almost always the "jump to bid form" link, not the submitter,
    // so it ranks below real buttons and is only used as a last resort.
    const byText = (root, base) => {
      for (const b of queryDeepAll('button, fl-button, [role="button"], a', root)) {
        if (!looksLikePlaceBidText(normalizedText(b))) continue;
        const tag = (b.tagName || '').toLowerCase();
        let score = base;
        if (tag === 'a') score -= 40;
        if (b.getAttribute && b.getAttribute('type') === 'submit') score += 15;
        consider(b, score);
      }
    };
    byText(container, 60);
    byText(document, 30);

    candidates.sort((a, b) => {
      const enabledDelta = (isButtonDisabled(a.el) ? 0 : 1) - (isButtonDisabled(b.el) ? 0 : 1);
      if (enabledDelta !== 0) return -enabledDelta;
      return b.score - a.score;
    });

    return candidates.map((c) => c.el);
  }

  /**
   * Returns the best Place Bid button. With requireEnabled the caller gets null while the
   * Angular form is still invalid, so it can keep waiting instead of clicking a dead button.
   */
  function findSafePlaceBidButton(requireEnabled = false) {
    const candidates = collectPlaceBidCandidates();
    if (requireEnabled) {
      return candidates.find((el) => !isButtonDisabled(el)) || null;
    }
    return candidates[0] || null;
  }

  /**
   * Safely and thoroughly click the Freelancer Place Bid button
   */
  /**
   * Re-dispatch input/blur on the filled fields so Angular re-runs validation and releases
   * the disabled state on the submit button.
   */
  function nudgeFormValidation() {
    const fields = [
      findSafeProposalField(),
      findSafeBidAmountField(),
      findSafeAmountField(),
      findSafeDeliveryDaysField(),
    ];
    for (const el of fields) {
      if (!el) continue;
      try {
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      } catch (e) {}
    }
  }

  /**
   * Last resort when no button can be clicked: submit the bid form itself.
   */
  function submitBidFormDirectly() {
    const container = findBidFormContainer();
    const form = (container && container.tagName === 'FORM') ? container : queryDeep('form[name="bidForm"], app-project-view-bid-form form, app-bid-form form', container);
    if (!form) return false;
    try {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
      console.log('[AutoBid] Submitted bid form directly as button fallback.');
      return true;
    } catch (e) {
      return false;
    }
  }

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
      // auto_submit is always emitted alongside autobid=1, so when it is present it decides.
      // Otherwise autobid=1 alone would auto-submit even with hands-free turned off.
      const explicitAutoSubmit = params.get('auto_submit');
      const autoSubmit = explicitAutoSubmit !== null
        ? explicitAutoSubmit === '1'
        : (params.get('autobid') === '1' || params.get('submit') === '1');

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
  // Numeric project id from the page URL: /projects/<slug>-<id>/details or /projects/<id>
  function projectIdFromUrl() {
    const m = window.location.pathname.match(/\/projects\/(?:[^/]*?-)?(\d{6,})(?:\/|$)/);
    return m ? Number(m[1]) : null;
  }

  async function getPendingBidData() {
    const urlData = parseAutoBidFromUrl();
    if (urlData && (urlData.proposal || urlData.amount)) return urlData;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get(['pendingAutoBid', 'handsFreeAutoSubmit', 'autoSubmitDelaySeconds', 'config']);
        if (stored && stored.pendingAutoBid) {
          const pb = stored.pendingAutoBid;
          // The stored payload belongs to one specific project. Applying it to whatever
          // project page happens to load would fill the wrong proposal.
          const pageId = projectIdFromUrl();
          if (pb.projectId && pageId && Number(pb.projectId) !== pageId) return null;
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
          failed: false,
          alreadyBid: true,
          reason: 'Bid already exists on this project'
        };
      }
    }
    if (
      pageText.includes('you have already placed a bid') ||
      pageText.includes('your bid on this project') ||
      pageText.includes('retract bid')
    ) {
      return {
        failed: false,
        alreadyBid: true,
        reason: 'Bid already exists on this project'
      };
    }

    // 2. Project Status: Closed / Deleted / Cancelled
    const statusBanner = queryDeep('app-project-view-header .ProjectView-header-status, .project-status, app-project-status, [data-qa="project-status"]');
    if (statusBanner && statusBanner.offsetParent !== null) {
      const statusText = (statusBanner.textContent || '').toLowerCase();
      if (
        statusText.includes('closed') ||
        statusText.includes('deleted') ||
        statusText.includes('cancelled')
      ) {
        return {
          failed: true,
          reason: `Project is ${statusText.trim()}`
        };
      }
    }

    return { failed: false };
  }

  /**
   * Show Informative Notification Banner (Tabs always remain open)
   */
  function showTerminalFailureBanner(reason) {
    const existing = document.getElementById('freelancer-autobid-floating-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'freelancer-autobid-floating-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999999;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #3b82f6;
      border-radius: 14px;
      padding: 16px 20px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      max-width: 420px;
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
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 8px #38bdf8;"></span>
          <strong style="color: #38bdf8; font-size: 14px;">
            AutoBid Status Notice
          </strong>
        </div>
        <button id="autobid-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; line-height: 1;">&times;</button>
      </div>
      <div style="color: #cbd5e1; line-height: 1.4; margin-bottom: 12px;">
        <div style="color: #93c5fd; font-weight: 600; margin-bottom: 4px;">• ${reason}</div>
        <div style="font-size: 12px; color: #94a3b8;">This tab closes shortly and the next queued project opens. Click Dismiss to keep it open.</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="autobid-retry-fill-btn" style="flex: 1; background: #2563eb; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
          Retry Auto-Fill 🔄
        </button>
        <button id="autobid-dismiss-btn" style="flex: 1; background: #334155; color: #cbd5e1; border: none; border-radius: 6px; padding: 7px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
          Dismiss
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('autobid-close-btn')?.addEventListener('click', () => banner.remove());
    document.getElementById('autobid-dismiss-btn')?.addEventListener('click', () => banner.remove());
    document.getElementById('autobid-retry-fill-btn')?.addEventListener('click', async () => {
      banner.remove();
      autofillRunning = false;
      try { sessionStorage.removeItem(FINISHED_FLAG); } catch (e) {}
      const data = await getPendingBidData();
      if (data) attemptAutofill(data);
    });
  }

  /**
   * Handle Terminal Notice: Log, display notice banner, notify background. NEVER closes tab.
   */
  function handleTerminalFailure(reason) {
    console.warn(`[AutoBid Notice] ${reason}`);
    markTabFinished();

    showTerminalFailureBanner(reason);

    // Report to the background worker, which closes this tab and starts the next project.
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
   * Ask the background worker to close this project tab and release the bid queue.
   * The background owns the timing, because it also decides which project opens next.
   */
  function requestTabClose(reason) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'SCHEDULE_TAB_CLOSE', reason });
      }
    } catch (e) {}
  }

  /**
   * Notification banner and autonomous submission handler
   */
  async function showAutoBidNotification(data, finalAmount) {
    const existing = document.getElementById('freelancer-autobid-floating-banner');
    if (existing) existing.remove();

    // The per-bid payload is authoritative. Stored settings are only a fallback, otherwise a
    // stale handsFreeAutoSubmit:false silently cancels a bid that was staged with auto_submit=1.
    let isAutoSubmit = data.autoSubmit !== undefined ? data.autoSubmit !== false : true;
    let delaySeconds = 2;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const st = await chrome.storage.local.get(['handsFreeAutoSubmit', 'autoSubmitDelaySeconds', 'config']);
        if (data.autoSubmit === undefined && st.handsFreeAutoSubmit !== undefined) {
          isAutoSubmit = st.handsFreeAutoSubmit !== false;
        }
        const storedDelay = parseInt(st.autoSubmitDelaySeconds, 10);
        if (!isNaN(storedDelay)) delaySeconds = Math.max(0, storedDelay);
      }
    } catch (e) {}

    if (isNaN(delaySeconds)) delaySeconds = 2;

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

        // 3. Find and click Place Bid button, retrying until the submission is confirmed.
        // A click can be swallowed (button still disabled, wrong node, Angular re-render), so
        // the attempt is only treated as final once the page actually reports the bid.
        let attempts = 0;
        const maxAttempts = 75; // 75 * 400ms = 30 seconds
        const maxClicks = 3;
        let clickCount = 0;

        const markSubmitted = () => {
          submitTriggered = true;
          markTabFinished();

          const countdownBox = document.getElementById('autobid-countdown-box');
          if (countdownBox) {
            countdownBox.style.background = '#064e3b';
            countdownBox.style.borderColor = '#059669';
            countdownBox.innerHTML = `
              <div style="font-size: 13px; color: #34d399; font-weight: 700;">
                ✅ Bid Successfully Confirmed!
              </div>
              <div style="font-size: 11px; color: #a7f3d0; margin-top: 2px;">
                🎉 Proposal and pricing submitted. This tab closes shortly and the next project opens.
              </div>
            `;
          }
          if (cancelBtn) cancelBtn.style.display = 'none';
          if (submitNowBtn) submitNowBtn.style.display = 'none';

          console.log('[BID] Bid successfully confirmed.');

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
        };

        const attemptClickButton = () => {
          if (cancelled || submitTriggered) return;

          if (checkSubmissionSuccess()) {
            markSubmitted();
            return;
          }

          attempts += 1;

          const enabledBtn = clickCount < maxClicks ? findSafePlaceBidButton(true) : null;

          if (enabledBtn) {
            clickCount += 1;
            console.log(`[AutoBid] Clicking Freelancer Place Bid button (click ${clickCount}/${maxClicks})`, enabledBtn);
            safelyClickPlaceBidButton(enabledBtn);
            // Give Freelancer time to process before deciding the click failed, so a slow
            // response can never turn into a duplicate bid.
            setTimeout(attemptClickButton, 3000);
            return;
          }

          if (clickCount >= maxClicks) {
            console.log(`[AutoBid] Waiting for Freelancer to confirm the submitted bid... (${attempts}/${maxAttempts})`);
          } else {
            const anyBtn = findSafePlaceBidButton(false);
            if (anyBtn) {
              // Button exists but Angular still considers the form invalid.
              console.log(`[AutoBid] Place Bid button found but disabled, re-validating form... (${attempts}/${maxAttempts})`);
              nudgeFormValidation();
            } else {
              console.log(`[AutoBid] Place Bid button not rendered yet, retrying... (${attempts}/${maxAttempts})`);
              maybeOpenBidForm();
            }
          }

          if (attempts >= maxAttempts) {
            if (clickCount === 0 && submitBidFormDirectly()) {
              setTimeout(() => {
                if (!cancelled && !submitTriggered) {
                  if (checkSubmissionSuccess()) markSubmitted();
                  else handleTerminalFailure('Place Bid button unavailable');
                }
              }, 2500);
              return;
            }
            console.warn('[AutoBid] Bid submission could not be confirmed after full retries.');
            handleTerminalFailure(
              clickCount > 0
                ? 'Place Bid was clicked but Freelancer did not confirm the bid'
                : 'Place Bid button unavailable'
            );
            return;
          }

          setTimeout(attemptClickButton, 400);
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

  /**
   * A bid upgrade is free only when its price is literally zero or it is labelled FREE.
   * A substring test for "$0" is not enough: Freelancer prices Sealed at "$0.10 USD" on
   * plenty of projects, and that string contains "$0", which would buy a paid upgrade.
   */
  function isUpgradeFree(label) {
    const text = (label || '').replace(/ /g, ' ').toLowerCase();
    if (!text) return false;

    const prices = text.match(/[$€£]\s*\d+(?:[.,]\d+)?/g) || [];
    for (const price of prices) {
      const value = parseFloat(price.replace(/[^0-9.,]/g, '').replace(',', '.'));
      if (!isNaN(value) && value > 0) return false;
    }
    if (prices.length > 0) return true;
    return /\bfree\b/.test(text);
  }

  /**
   * Tick a bid upgrade checkbox, but only when it is confirmed free.
   * The upgrade checkboxes carry randomised ids and no name, so they are matched by label.
   */
  function tickFreeUpgrade(keyword, enabled) {
    if (!enabled) return;

    const container = findBidFormContainer();
    for (const box of queryDeepAll('input[type="checkbox"]', container)) {
      if (box.checked) continue;

      let label = '';
      let parent = box.parentElement;
      let depth = 0;
      while (parent && depth < 6) {
        const text = (parent.innerText || '').replace(/\s+/g, ' ').trim();
        if (text.length > label.length) label = text;
        parent = parent.parentElement;
        depth++;
      }

      if (!label.toLowerCase().includes(keyword)) continue;

      if (!isUpgradeFree(label)) {
        console.log(`[AutoBid] Skipping paid ${keyword} upgrade: ${label.slice(0, 60)}`);
        continue;
      }

      box.click();
      console.log(`[AutoBid] Selected confirmed free ${keyword} upgrade.`);
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

    // In-page status check
    const termCheck = await scanPageForTerminalFailures();
    if (termCheck.alreadyBid) {
      console.log('[AutoBid] A bid already exists on this project.');
      // Still reported, otherwise the queue would wait on this tab until the watchdog fires.
      handleTerminalFailure('You have already placed a bid on this project.');
      autofillRunning = false;
      return;
    }
    if (termCheck.failed) {
      console.warn('[AutoBid Safety] Notice:', termCheck.reason);
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

    let loggedFieldResolution = false;

    const startTime = Date.now();
    const interval = setInterval(() => {
      maybeOpenBidForm();

      // One-time report of which fields resolved, so a failure says exactly what was missing.
      if (!loggedFieldResolution && Date.now() - startTime > 2000) {
        loggedFieldResolution = true;
        const describe = (el) => {
          if (!el) return 'NOT FOUND';
          const id = el.getAttribute('formcontrolname') || el.getAttribute('data-qa') || el.getAttribute('name') || el.id || '';
          return `found (${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''}${id ? ` ${id}` : ''})`;
        };
        console.log('[AutoBid Fields] Proposal:', describe(findSafeProposalField()));
        console.log('[AutoBid Fields] Bid Amount:', describe(findSafeBidAmountField()));
        console.log('[AutoBid Fields] Delivery Days:', describe(findSafeDeliveryDaysField()));
        console.log('[AutoBid Fields] Milestone Amount:', describe(findSafeAmountField()));
      }

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

      // 5. Paid bid upgrades are opt-in and only ever taken when genuinely free.
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get('config').then((res) => {
            const cfg = res.config || {};
            tickFreeUpgrade('sealed', cfg.allowFreeSealedUpgrade);
            tickFreeUpgrade('nda', cfg.allowFreeNdaUpgrade);
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
      const isTimedOut = Date.now() - startTime > 25000;

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
          const missing = [];
          if (!filledProposal) missing.push('Proposal');
          if (!filledBidAmount) missing.push('Bid Amount');
          if (!filledPeriod) missing.push('Delivery Days');
          const detail = missing.length ? `Could not fill: ${missing.join(', ')}` : 'Bid form missing or timed out';
          console.warn(`[AutoBid] ${detail}`);
          handleTerminalFailure(detail);
        }
      }
    }, 300);
  }

  // Once a tab has reached a terminal state the attempt is over. Freelancer is an SPA, so
  // popstate/hashchange fire on in-page navigation and would otherwise restart the autofill.
  const FINISHED_FLAG = '__freelancer_autobid_finished__';
  function markTabFinished() {
    try { sessionStorage.setItem(FINISHED_FLAG, '1'); } catch (e) {}
  }
  function isTabFinished() {
    try { return sessionStorage.getItem(FINISHED_FLAG) === '1'; } catch (e) { return false; }
  }

  // Initialize flow
  async function init() {
    if (!isSafeBidPage()) return;
    if (isTabFinished()) return;
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
