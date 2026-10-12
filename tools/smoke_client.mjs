/**
 * smoke_client.mjs — verifies the generated client bundle honours the DSH
 * client-plugin contract without needing a browser or the running host:
 *
 *   1. it self-registers through window.__ModuleLoader__.load()
 *   2. the registered id is the package name
 *   3. the factory is callable and returns { apply, inject, replay }
 *   4. apply(ctx) registers exactly one shell.overlay entry, via inject() when
 *      the slot service offers it
 *
 * Run: node tools/smoke_client.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const code = readFileSync(join(root, "lib", "client.js"), "utf8");

const failures = [];
const check = (label, ok, detail) => {
  if (!ok) failures.push(label + (detail ? " — " + detail : ""));
  console.log((ok ? "ok   " : "FAIL ") + label + (detail ? "  (" + detail + ")" : ""));
};

/* --- a stand-in for the DSH client module loader ------------------------- */
const registered = [];
let captured = null;
const React = {
  createElement: (type, props, ...kids) => ({ type, props, kids }),
  useRef: (v) => ({ current: v }),
  useEffect: () => undefined,
};
const requireShim = (id) => {
  if (id === "react") return React;
  throw new Error("unexpected require: " + id);
};

globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => {
      registered.push(entry);
      captured = entry;
    },
  },
};
globalThis.document = undefined;

/* --- 1..3: registration -------------------------------------------------- */
new Function("require", code)(requireShim);

check("bundle self-registers once", registered.length === 1, registered.length + " call(s)");
check("registered id is the package name", captured && captured.id === pkg.name, captured && captured.id);
check("factory is a function", typeof (captured && captured.factory) === "function");

const exports = captured.factory(requireShim);
check("exports.apply is a function", typeof exports.apply === "function");
check("exports.inject lists slots", Array.isArray(exports.inject) && exports.inject.includes("slots"),
  JSON.stringify(exports.inject));
check("exports.replay is a function", typeof exports.replay === "function");

/* --- 4: apply() uses slots.inject when available ------------------------- */
const calls = [];
const disposers = [];
const ctx = {
  get: (key) => (key === "slots" ? slotsApi : undefined),
  effect: (fn, label) => { calls.push("effect:" + label); disposers.push(fn()); },
};
const slotsApi = {
  inject: (key, cb) => { calls.push("inject:" + key); return cb(); },
  register: (spec, comp) => { calls.push("register:" + spec.name + "#" + spec.id); return () => {} ; },
};

exports.apply(ctx);

check("apply() injects into shell.overlay",
  calls.includes("inject:shell.overlay"), calls.join(" "));
check("apply() registers deepseek-splash in shell.overlay",
  calls.includes("register:shell.overlay#deepseek-splash"), calls.join(" "));
check("apply() wraps registration in ctx.effect",
  calls.some((c) => c.startsWith("effect:deepseek-splash")), calls.join(" "));

/* --- the registered component must render without a live DOM ------------- */
const spec = { };
const component = (() => {
  const capturedSpec = {};
  const api = {
    inject: (k, cb) => cb(),
    register: (s, c) => { Object.assign(capturedSpec, s); spec.component = c; return () => {}; },
  };
  const ctx2 = { get: () => api, effect: (fn) => fn() };
  exports.apply(ctx2);
  return spec.component;
})();

check("component is a function", typeof component === "function");

/* The desktop launch screen already plays the opening, so the overlay has to
   stay quiet unless a page asks for it by name. */
const quiet = component();
check("component renders nothing by default", quiet === null, JSON.stringify(quiet && quiet.type));

globalThis.window.__DSS_SPLASH__ = { overlay: true };
const optedIn = component();
check("component renders when the overlay is opted in", !!(optedIn && optedIn.type),
  JSON.stringify(optedIn && optedIn.type));

globalThis.window.__DSS_SPLASH__ = { disabled: true };
const switchedOff = component();
check("component stays quiet when disabled", switchedOff === null, JSON.stringify(switchedOff && switchedOff.type));
delete globalThis.window.__DSS_SPLASH__;

console.log("");
if (failures.length) {
  console.log("FAILED: " + failures.length + " check(s)");
  process.exitCode = 1;
} else {
  console.log("all checks passed");
}
