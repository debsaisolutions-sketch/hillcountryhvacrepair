/* TradeDeskPro first-touch/UTM capture */
(function () {
  if (typeof document === "undefined") return;
  var s = document.createElement("script");
  s.src = "https://www.tradedeskpro.com/js/tdp-lead-attribution.js";
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
})();

/**
 * Lead intake for Hill Country HVAC Repair → TradeDeskPro /api/leads.
 * Fetch shape follows houstontxhvacrepair.com /js/leads.js.
 * Profile: Deb / Debs AI Solutions (full UUID from the septic site form).
 * No client secret is sent. Fast or honeypot submits are not posted.
 */
(function () {
  var API_URL = "https://www.tradedeskpro.com/api/leads";
  var PROFILE_ID = "63e7470e-fe1e-4367-aae0-56d0d6392d78";
  var SOURCE = "hillcountryhvacrepair.com";
  var PHONE_DISPLAY = "+1 (830) 307-7334";
  var MIN_MS = 3000;
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var loadedAt = Date.now();

  function field(form, name) {
    return form.querySelector('[name="' + name + '"]');
  }

  function show(el, text) {
    if (!el) return;
    el.textContent = text;
    el.style.display = "block";
  }

  function hide(el) {
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
  }

  function pageLocation() {
    try {
      return window.location.href || "";
    } catch (e) {
      return "";
    }
  }

  function pageSearch() {
    try {
      return window.location.search || "";
    } catch (e) {
      return "";
    }
  }

  function provenance() {
    var helper = {};
    try {
      if (typeof window.tdpLeadAttribution === "function") {
        helper = window.tdpLeadAttribution() || {};
      }
    } catch (e) {
      helper = {};
    }

    var params;
    try {
      params = new URLSearchParams(pageSearch());
    } catch (e2) {
      params = { get: function () { return ""; } };
    }

    var extra = {
      landing_url: helper.landing_url || pageLocation(),
    };
    if (helper.first_touch_url) extra.first_touch_url = helper.first_touch_url;
    if (helper.referrer) extra.referrer = helper.referrer;

    for (var i = 0; i < UTM_KEYS.length; i++) {
      var key = UTM_KEYS[i];
      var value = helper[key] || (params.get ? params.get(key) : "") || "";
      if (value) extra[key] = value;
    }
    return extra;
  }

  function buildMessage(payload) {
    var lines = [];
    if (payload.service) lines.push("Service: " + payload.service);
    if (payload.area) lines.push("Area: " + payload.area);
    if (payload.message) lines.push(payload.message);
    return lines.join("\n");
  }

  function leadBody(payload) {
    var body = {
      name: payload.name,
      profile_id: PROFILE_ID,
      phone: payload.phone || "",
      email: payload.email || "",
      message: buildMessage(payload),
      source: SOURCE,
    };
    var extra = provenance();
    var key;
    for (key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key) && extra[key]) {
        body[key] = extra[key];
      }
    }
    return body;
  }

  function errorMessage(status) {
    if (status === 429) {
      return "We're getting a lot of requests right now. Please call " + PHONE_DISPLAY + " and we'll help right away.";
    }
    if (status === 403) {
      return "We couldn't send that from this page. Please call " + PHONE_DISPLAY + " and we'll help right away.";
    }
    return "We couldn't confirm the send. Please call " + PHONE_DISPLAY + " and we'll help right away.";
  }

  async function submitLead(payload) {
    var res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadBody(payload)),
    });
    if (res.status === 201 || res.status === 202 || (res.ok && res.status >= 200 && res.status < 300)) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status };
  }

  function fakeSuccess(form, success, error) {
    hide(error);
    show(success, "Request received. We'll call you back during business hours.");
    if (form.reset) form.reset();
  }

  function wireForm(form) {
    if (!form || form.dataset.leadsWired === "1") return;
    form.dataset.leadsWired = "1";
    form.removeAttribute("action");
    form.setAttribute("method", "post");

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"], button:not([type])');
      var original = btn ? btn.textContent : "";
      var success = document.getElementById("form-success");
      var error = document.getElementById("form-error");
      hide(success);
      hide(error);

      var honeypot = field(form, "company_website");
      if (honeypot && String(honeypot.value || "").trim()) {
        fakeSuccess(form, success, error);
        return;
      }

      if (Date.now() - loadedAt < MIN_MS) {
        fakeSuccess(form, success, error);
        return;
      }

      var nameEl = field(form, "name");
      var emailEl = field(form, "email");
      var phoneEl = field(form, "phone");
      var serviceEl = field(form, "service");
      var areaEl = field(form, "area");
      var messageEl = field(form, "message");
      var phone = phoneEl ? String(phoneEl.value || "").trim() : "";

      if (!phone) {
        show(error, "Add a phone number, or call " + PHONE_DISPLAY + ".");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending...";
      }

      try {
        var result = await submitLead({
          name: nameEl ? String(nameEl.value || "").trim() : "",
          email: emailEl ? String(emailEl.value || "").trim() : "",
          phone: phone,
          service: serviceEl ? String(serviceEl.value || "").trim() : "",
          area: areaEl ? String(areaEl.value || "").trim() : "",
          message: messageEl ? String(messageEl.value || "").trim() : "",
        });
        if (result.ok) {
          show(success, "Request received. We'll be in touch soon. For an urgent no-cool or no-heat call, phone " + PHONE_DISPLAY + ".");
          if (form.reset) form.reset();
        } else {
          show(error, errorMessage(result.status));
        }
      } catch (err) {
        show(error, errorMessage(0));
      }

      if (btn) {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  function init() {
    document.querySelectorAll("form.lead-form").forEach(wireForm);
  }

  window.HillCountryLeads = {
    submitLead: submitLead,
    wireForm: wireForm,
    leadBody: leadBody,
    loadedAt: function () { return loadedAt; },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
