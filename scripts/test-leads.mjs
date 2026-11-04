#!/usr/bin/env node
/**
 * Local lead-form checks with a mocked fetch. Never calls TradeDeskPro.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = fs.readFileSync(path.join(root, "js/leads.js"), "utf8");
const PHONE = "+1 (830) 307-7334";
const PROFILE = "63e7470e-fe1e-4367-aae0-56d0d6392d78";

function boot(options = {}) {
  const start = options.now ?? 1_700_000_000_000;
  let clock = start;
  const fields = {};
  function input(name, value) {
    fields[name] = { name, value, style: { display: "" }, textContent: "" };
  }
  input("name", "Ada Homeowner");
  input("phone", "8303077334");
  input("email", "ada@example.com");
  input("service", "Emergency AC repair");
  input("area", "Kerrville");
  input("message", "Outdoor unit is running and the house is warm.");
  input("company_website", options.honeypot || "");

  const success = { id: "form-success", textContent: "", style: { display: "none" } };
  const error = { id: "form-error", textContent: "", style: { display: "none" } };
  const button = { textContent: "Request free estimate", disabled: false, type: "submit" };
  const calls = [];

  const form = {
    dataset: {},
    reset() {
      for (const el of Object.values(fields)) el.value = "";
    },
    removeAttribute() {},
    setAttribute() {},
    querySelector(sel) {
      if (String(sel).includes("button")) return button;
      const match = String(sel).match(/name="([^"]+)"/);
      return match ? fields[match[1]] : null;
    },
    addEventListener(type, fn) {
      if (type === "submit") this.onSubmit = fn;
    },
  };

  const document = {
    readyState: "complete",
    head: { appendChild() {} },
    documentElement: { appendChild() {} },
    createElement() {
      return {};
    },
    querySelectorAll(sel) {
      return sel === "form.lead-form" ? [form] : [];
    },
    getElementById(id) {
      if (id === "form-success") return success;
      if (id === "form-error") return error;
      return null;
    },
    addEventListener() {},
  };

  const search = options.search || "?utm_source=mail&utm_medium=email";
  const sandbox = {
    URLSearchParams,
    console,
    Date: class extends Date {
      static now() {
        return clock;
      }
    },
    fetch: options.fetch || (async (url, init) => {
      calls.push({ url, init: { ...init, body: init.body } });
      return {
        status: options.status ?? 201,
        ok: (options.status ?? 201) >= 200 && (options.status ?? 201) < 300,
        json: async () => ({ inbox_id: "mock" }),
        text: async () => "",
      };
    }),
  };
  sandbox.window = sandbox;
  sandbox.document = document;
  sandbox.location = {
    href: "https://hillcountryhvacrepair.com/" + search,
    search,
  };
  sandbox.window.location = sandbox.location;
  if (options.attribution) sandbox.tdpLeadAttribution = options.attribution;

  vm.runInNewContext(code, sandbox, { filename: "js/leads.js" });

  return {
    form,
    fields,
    success,
    error,
    button,
    calls,
    sandbox,
    setNow(value) {
      clock = value;
    },
    start,
    async submit() {
      await form.onSubmit({ preventDefault() {} });
    },
  };
}

function postedBody(ctx) {
  assert.equal(ctx.calls.length, 1);
  const call = ctx.calls[0];
  assert.equal(call.url, "https://www.tradedeskpro.com/api/leads");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers["Content-Type"], "application/json");
  const headers = JSON.stringify(call.init.headers).toLowerCase();
  assert.equal(headers.includes("x-tdp-lead-secret"), false);
  return JSON.parse(call.init.body);
}

const fast = boot();
fast.setNow(fast.start + 500);
await fast.submit();
assert.equal(fast.calls.length, 0, "submits under 3s must not post");
assert.match(fast.success.textContent, /Request received/);
assert.equal(fast.success.style.display, "block");

const bot = boot({ honeypot: "https://spam.example" });
bot.setNow(bot.start + 5000);
await bot.submit();
assert.equal(bot.calls.length, 0, "honeypot must not post");
assert.equal(bot.success.style.display, "block");
assert.equal(bot.fields.company_website.value, "");

const missingPhone = boot();
missingPhone.fields.phone.value = "   ";
missingPhone.setNow(missingPhone.start + 5000);
await missingPhone.submit();
assert.equal(missingPhone.calls.length, 0);
assert.match(missingPhone.error.textContent, /830\) 307-7334/);

let release;
let sawDisabled = false;
const pending = boot({
  fetch: (url, init) => {
    pending.calls.push({ url, init });
    return new Promise((resolve) => {
      release = () => {
        sawDisabled = pending.button.disabled && pending.button.textContent === "Sending...";
        resolve({
          status: 201,
          ok: true,
          json: async () => ({ inbox_id: "mock" }),
          text: async () => "",
        });
      };
    });
  },
});
pending.setNow(pending.start + 5000);
const inflight = pending.submit();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(pending.button.disabled, true);
assert.equal(pending.button.textContent, "Sending...");
release();
await inflight;
assert.equal(sawDisabled, true);
assert.equal(pending.button.disabled, false);
assert.equal(pending.button.textContent, "Request free estimate");

const ok = boot({ status: 201 });
ok.setNow(ok.start + 4000);
await ok.submit();
const body = postedBody(ok);
assert.equal(body.name, "Ada Homeowner");
assert.equal(body.profile_id, PROFILE);
assert.equal(body.phone, "8303077334");
assert.equal(body.email, "ada@example.com");
assert.equal(body.source, "hillcountryhvacrepair.com");
assert.equal(body.landing_url, "https://hillcountryhvacrepair.com/?utm_source=mail&utm_medium=email");
assert.equal(body.utm_source, "mail");
assert.equal(body.utm_medium, "email");
assert.equal(body.utm_campaign, undefined);
assert.equal(
  body.message,
  "Service: Emergency AC repair\nArea: Kerrville\nOutdoor unit is running and the house is warm.",
);
assert.equal(ok.success.style.display, "block");
assert.equal(ok.error.style.display, "none");
assert.equal(ok.fields.name.value, "");

const filtered = boot({ status: 202 });
filtered.setNow(filtered.start + 4000);
await filtered.submit();
assert.equal(filtered.calls.length, 1);
assert.match(filtered.success.textContent, /Request received/);
assert.equal(filtered.error.style.display, "none");

for (const status of [403, 429, 500]) {
  const failed = boot({ status });
  failed.setNow(failed.start + 4000);
  await failed.submit();
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.success.style.display, "none");
  assert.equal(failed.error.textContent.includes(PHONE), true);
  if (status === 429) assert.match(failed.error.textContent, /lot of requests/);
  if (status === 403) assert.match(failed.error.textContent, /couldn't send that from this page/);
}

const thrown = boot({
  fetch: async () => {
    throw new Error("offline");
  },
});
thrown.setNow(thrown.start + 4000);
await thrown.submit();
assert.match(thrown.error.textContent, /307-7334/);
assert.equal(thrown.button.disabled, false);

const attributed = boot({
  search: "",
  attribution() {
    return {
      landing_url: "https://hillcountryhvacrepair.com/?utm_source=gbp",
      first_touch_url: "https://hillcountryhvacrepair.com/?utm_source=gbp",
      referrer: "https://www.google.com/",
      utm_source: "gbp",
      utm_campaign: "kerrville",
    };
  },
});
attributed.setNow(attributed.start + 4000);
await attributed.submit();
const tagged = postedBody(attributed);
assert.equal(tagged.landing_url, "https://hillcountryhvacrepair.com/?utm_source=gbp");
assert.equal(tagged.first_touch_url, "https://hillcountryhvacrepair.com/?utm_source=gbp");
assert.equal(tagged.referrer, "https://www.google.com/");
assert.equal(tagged.utm_source, "gbp");
assert.equal(tagged.utm_campaign, "kerrville");

console.log("Lead form mock tests passed.");
