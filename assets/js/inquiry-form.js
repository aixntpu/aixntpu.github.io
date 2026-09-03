/* ==========================================================================
   NTPU AI4X | Collaboration inquiry form
   ==========================================================================
   The page posts JSON to a Cloudflare Worker (POST <endpoint>/contact), which
   verifies Turnstile and forwards to Apps Script. The browser never sees the
   Apps Script URL or any secret.

   Every visible string comes from data-* attributes in the markup, so this one
   file serves the Chinese and English pages without carrying translations.

   Two rules this file must keep:
     - never log form values: no console.* call may receive user input;
     - never write user or server text with innerHTML: textContent only.
   ========================================================================== */
(function () {
  'use strict';

  var form = document.querySelector('[data-inquiry-form]');
  if (!form) return;

  var statusEl = form.querySelector('[data-form-status]');
  var submitBtn = form.querySelector('[data-submit]');
  var copyBtn = form.querySelector('[data-copy-inquiry]');
  var summary = form.querySelector('#inq-summary');
  var counter = form.querySelector('[data-char-count]');
  var honeypot = form.querySelector('[data-honeypot]');
  var successPanel = document.querySelector('[data-inquiry-success]');
  var successId = successPanel && successPanel.querySelector('[data-submission-id]');

  // Read at submit time, not at load: the attribute is the single source of
  // truth and can be swapped (staging endpoint, tests) without a reload.
  function endpoint() { return (form.getAttribute('data-endpoint') || '').trim(); }

  // Turnstile is only loaded once it has a real site key. With the
  // YOUR_TURNSTILE_SITE_KEY placeholder still in place, Cloudflare's script
  // throws and renders its own "Troubleshoot" link on every page view, so
  // skip the request entirely and hide the field until it's configured.
  (function initTurnstile() {
    var widget = document.querySelector('.cf-turnstile');
    if (!widget) return;
    var siteKey = (widget.getAttribute('data-sitekey') || '').trim();
    var configured = siteKey && siteKey.indexOf('YOUR_') !== 0;
    if (configured) {
      var script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      return;
    }
    var field = widget.closest('.turnstile-field');
    if (field) field.hidden = true;
  })();

  var locale = document.documentElement.lang && document.documentElement.lang.indexOf('zh') === 0 ? 'zh' : 'en';
  var submitting = false;

  function msg(key) { return form.getAttribute('data-msg-' + key) || ''; }

  function setStatus(text, tone) {
    if (!statusEl) return;
    // textContent, never innerHTML: server codes and field names are data.
    statusEl.textContent = text || '';
    statusEl.className = 'form-status' + (tone ? ' ' + tone : '');
  }

  /* ---- validation ------------------------------------------------------ */

  function groupOf(control) {
    return control.closest('.field, .field-set, .field-check');
  }

  function isFilled(control) {
    if (control.type === 'checkbox') return control.checked;
    if (control.type === 'radio') {
      return !!form.querySelector('input[name="' + control.name + '"]:checked');
    }
    return control.value.trim() !== '';
  }

  function isValid(control) {
    if (!isFilled(control)) return false;
    return typeof control.checkValidity !== 'function' || control.checkValidity();
  }

  function mark(control, ok) {
    var group = groupOf(control);
    if (!group) return;
    group.classList.toggle('has-error', !ok);
    if (control.type !== 'radio' && control.type !== 'checkbox') {
      control.setAttribute('aria-invalid', ok ? 'false' : 'true');
    }
  }

  function requiredControls() {
    var seen = {};
    return Array.prototype.filter.call(form.querySelectorAll('[required]'), function (control) {
      if (control.type === 'radio') {
        if (seen[control.name]) return false;
        seen[control.name] = true;
      }
      return true;
    });
  }

  function validate() {
    var firstBad = null;
    requiredControls().forEach(function (control) {
      var ok = isValid(control);
      mark(control, ok);
      if (!ok && !firstBad) firstBad = control;
    });
    if (firstBad) {
      setStatus(msg('invalid'), 'warn');
      firstBad.focus();
      var group = groupOf(firstBad);
      if (group && group.scrollIntoView) {
        group.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return false;
    }
    return true;
  }

  /** Flags the fields the Worker rejected, using the codes it returned. */
  function markServerFields(fields) {
    if (!fields || !fields.length) return;
    fields.forEach(function (name) {
      var control = form.querySelector('[name="' + String(name).replace(/[^a-zA-Z]/g, '') + '"]');
      if (control) mark(control, false);
    });
  }

  form.addEventListener('input', function (event) {
    var control = event.target;
    if (control.hasAttribute('required') && groupOf(control) && isValid(control)) mark(control, true);
  });
  form.addEventListener('change', function (event) {
    var control = event.target;
    if (control.hasAttribute('required') && isValid(control)) mark(control, true);
  });

  /* ---- payload --------------------------------------------------------- */

  function labelOf(control) {
    return control.getAttribute('data-label') || control.name;
  }

  function valueOf(control) {
    if (control.type === 'radio') {
      var picked = form.querySelector('input[name="' + control.name + '"]:checked');
      return picked ? (picked.getAttribute('data-label') || picked.value) : '';
    }
    if (control.tagName === 'SELECT') {
      return control.selectedIndex > -1 && control.value
        ? control.options[control.selectedIndex].text
        : '';
    }
    return control.value.trim();
  }

  function fieldValue(name) {
    var control = form.querySelector('[name="' + name + '"]');
    return control ? control.value.trim() : '';
  }

  function selectedType() {
    var picked = form.querySelector('input[name="type"]:checked');
    return picked ? picked.value : '';
  }

  function requestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    // Older Safari: 16 random bytes is plenty for an idempotency key.
    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.prototype.map
        .call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); })
        .join('');
    }
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }

  function turnstileToken() {
    var field = form.querySelector('[name="cf-turnstile-response"]');
    if (field && field.value) return field.value;
    if (window.turnstile && typeof window.turnstile.getResponse === 'function') {
      try { return window.turnstile.getResponse() || ''; } catch (err) { return ''; }
    }
    return '';
  }

  function resetTurnstile() {
    // A token is single use: whatever happened, the widget must be re-armed.
    if (window.turnstile && typeof window.turnstile.reset === 'function') {
      try { window.turnstile.reset(); } catch (err) { /* widget not mounted */ }
    }
  }

  function buildPayload(token) {
    return {
      name: fieldValue('name'),
      org: fieldValue('org'),
      title: fieldValue('title'),
      email: fieldValue('email'),
      phone: fieldValue('phone'),
      timeline: fieldValue('timeline'),
      type: selectedType(),
      summary: fieldValue('summary'),
      consent: !!form.querySelector('[name="consent"]:checked'),
      requestId: requestId(),
      locale: locale,
      sourcePage: window.location.origin + window.location.pathname,
      turnstileToken: token
    };
  }

  /* ---- plain-text copy (secondary fallback) ---------------------------- */

  function entries() {
    var out = [];
    var seen = {};
    Array.prototype.forEach.call(
      form.querySelectorAll('input[data-label], select[data-label], textarea[data-label]'),
      function (control) {
        if (control.type === 'checkbox') return;
        if (control.type === 'radio') {
          if (seen[control.name]) return;
          seen[control.name] = true;
          out.push({
            label: control.getAttribute('data-group-label') || labelOf(control),
            value: valueOf(control)
          });
          return;
        }
        out.push({ label: labelOf(control), value: valueOf(control) });
      }
    );
    return out.filter(function (entry) { return entry.value !== ''; });
  }

  function plainText() {
    var subjectPrefix = form.getAttribute('data-subject-prefix') || '';
    var tail = [valueOf(form.querySelector('input[name="type"]')), fieldValue('org'), fieldValue('name')]
      .filter(Boolean)
      .join(' / ');
    var lines = entries().map(function (entry) {
      return entry.value.indexOf('\n') > -1
        ? entry.label + ':\n' + entry.value
        : entry.label + ': ' + entry.value;
    });
    return (subjectPrefix + (tail ? ' ' + tail : '')) + '\n\n' + lines.join('\n');
  }

  /* ---- submit ---------------------------------------------------------- */

  function setBusy(busy) {
    submitting = busy;
    if (!submitBtn) return;
    submitBtn.disabled = busy;
    submitBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
    var label = submitBtn.querySelector('[data-submit-label]');
    if (label) {
      label.textContent = busy
        ? submitBtn.getAttribute('data-label-busy') || label.textContent
        : submitBtn.getAttribute('data-label-idle') || label.textContent;
    }
  }

  function showSuccess(submissionId) {
    if (successId) successId.textContent = submissionId || '';
    if (successPanel) {
      successPanel.hidden = false;
      form.hidden = true;
      if (successPanel.focus) successPanel.focus();
      if (successPanel.scrollIntoView) successPanel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      setStatus(msg('sent'), 'ok');
    }
  }

  function errorMessage(code) {
    return form.getAttribute('data-msg-err-' + code) || msg('err-generic');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting) return;

    // Honeypot: a real visitor never sees this field. Answer as if it worked
    // and stop here, so a bot gets no signal about what gave it away.
    if (honeypot && honeypot.value.trim() !== '') {
      showSuccess('');
      return;
    }

    if (!validate()) return;

    var url = endpoint();
    if (url.indexOf('https://') !== 0) {
      // Endpoint not configured yet: say so plainly instead of failing silently.
      setStatus(errorMessage('not_configured'), 'warn');
      return;
    }

    var token = turnstileToken();
    if (!token) {
      setStatus(msg('turnstile-missing'), 'warn');
      return;
    }

    setBusy(true);
    setStatus(msg('sending'), '');

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 20000) : null;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(token)),
      mode: 'cors',
      credentials: 'omit',
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () { return {}; })
          .then(function (body) { return { status: response.status, body: body }; });
      })
      .then(function (result) {
        if (result.status === 200 && result.body && result.body.ok === true) {
          showSuccess(result.body.submissionId);
          return;
        }
        var error = (result.body && result.body.error) || {};
        markServerFields(error.fields);
        setStatus(errorMessage(error.code || 'generic'), 'warn');
      })
      .catch(function () {
        // Network failure, CORS rejection or timeout. No detail is logged:
        // the payload is PII and the response may carry internal codes.
        setStatus(errorMessage('network'), 'warn');
      })
      .then(function () {
        if (timer) clearTimeout(timer);
        setBusy(false);
        resetTurnstile();
      });
  });

  /* ---- copy fallback --------------------------------------------------- */

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      if (!validate()) return;
      var text = plainText();
      var done = function () { setStatus(msg('copied'), 'ok'); };
      var failed = function () { setStatus(msg('copyfail'), 'warn'); };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, failed);
        return;
      }
      var scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.setAttribute('readonly', '');
      scratch.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(scratch);
      scratch.select();
      try {
        if (document.execCommand('copy')) done(); else failed();
      } catch (err) {
        failed();
      }
      document.body.removeChild(scratch);
    });
  }

  /* ---- summary character counter --------------------------------------- */

  if (summary && counter) {
    var max = parseInt(summary.getAttribute('maxlength'), 10) || 0;
    var render = function () {
      counter.textContent = summary.value.length + (max ? ' / ' + max : '');
      counter.classList.toggle('over', max > 0 && summary.value.length >= max);
    };
    summary.addEventListener('input', render);
    render();
  }
})();
