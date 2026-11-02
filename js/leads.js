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
 * Same fetch approach as houstontxhvacrepair.com /js/leads.js.
 * Profile: Deb / Debs AI Solutions (full UUID from the septic site form).
 */
(function () {
  var API_URL = "https://www.tradedeskpro.com/api/leads";
  var PROFILE_ID = "63e7470e-fe1e-4367-aae0-56d0d6392d78";
  var SOURCE = "hillcountryhvacrepair.com";
  var PHONE_DISPLAY = "+1 (830) 307-7334";

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

  async function submitLead(payload) {
    var service = payload.service || "";
    var note = payload.message || "";
    var message = [service ? "Service: " + service : "", note].filter(Boolean).join("\n");

    var body = {
      name: payload.name,
      phone: payload.phone || "",
      email: payload.email || "",
      service: service,
      message: message,
      source: SOURCE,
      profile_id: PROFILE_ID,
    };

    var res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var errText = await res.text().catch(function () {
        return "";
      });
      throw new Error(errText || "Lead submit failed");
    }
    return res.json();
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
      if (honeypot && honeypot.value.trim()) {
        show(success, "Request received. We'll call you back during business hours.");
        form.reset();
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending...";
      }

      var nameEl = field(form, "name");
      var emailEl = field(form, "email");
      var phoneEl = field(form, "phone");
      var serviceEl = field(form, "service");
      var messageEl = field(form, "message");

      try {
        await submitLead({
          name: nameEl ? nameEl.value.trim() : "",
          email: emailEl ? emailEl.value.trim() : "",
          phone: phoneEl ? phoneEl.value.trim() : "",
          service: serviceEl ? serviceEl.value.trim() : "",
          message: messageEl ? messageEl.value.trim() : "",
        });
        show(success, "Request received. We'll be in touch soon. For an urgent no-cool or no-heat call, phone " + PHONE_DISPLAY + ".");
        form.reset();
      } catch (err) {
        show(error, "We couldn't confirm the send. Please call " + PHONE_DISPLAY + " and we'll help right away.");
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

  window.HillCountryLeads = { submitLead: submitLead, wireForm: wireForm };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
