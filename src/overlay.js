/* ============================================================================
   dsh-deepseek-splash — client plugin half.
   Registers one entry in the `shell.overlay` slot and plays the opening
   animation once per page load. Uses only `react` (+ optional `react-dom`).
   ========================================================================== */

var DSS_STYLE_ID = "dss-splash-style";
var dssPlayed = false;
var dssPortal = null;

try {
  var dssReactDom = require("react-dom");
  if (dssReactDom && typeof dssReactDom.createPortal === "function") dssPortal = dssReactDom.createPortal;
} catch (err) { /* portal is optional: the overlay layer is frame-wide already */ }

function dssInjectStyle() {
  var doc = document;
  if (doc.getElementById(DSS_STYLE_ID)) return;
  var el = doc.createElement("style");
  el.id = DSS_STYLE_ID;
  el.setAttribute("data-plugin", "dsh-deepseek-splash");
  el.textContent = CSS_TEXT;
  (doc.head || doc.documentElement).appendChild(el);
}

function dssOptions() {
  var cfg = (typeof window !== "undefined" && window.__DSS_SPLASH__) || {};
  return cfg && typeof cfg === "object" ? cfg : {};
}

/* The desktop launch screen (resources/splash.html) already plays this animation
   the moment the app window appears, so playing the very same 2.8 seconds again
   as the shell finishes loading reads as a stutter, not as a welcome. The
   overlay therefore stays quiet unless it is asked for by name:

     window.__DSS_SPLASH__ = { overlay: true };   // or { disabled: false }

   Which is what to reach for when the GUI is opened somewhere the launch screen
   never runs — a plain browser, a second window. */
function dssOverlayWanted(cfg) {
  if (cfg.disabled === true) return false;
  return cfg.overlay === true || cfg.disabled === false;
}

/* Diagnostics: `document.documentElement.dataset.dssSplash` reads back
   "waiting" while the curtain is held back, "playing" while it is up,
   "done" once it is gone and "skipped" when this load plays nothing. */
function dssMark(state) {
  try {
    document.documentElement.setAttribute("data-dss-splash", state);
  } catch (err) { /* ignore */ }
}

/* The harness window is created before it is shown, so an animation that starts
   at page load can be over before the window is on screen. Hold the curtain
   until the window is visible — but never until it is *focused*: the desktop
   shell raises the window without stealing focus, and an opening that waits for
   a click nobody makes is an opening nobody sees. */
function dssOnScreen(win) {
  try {
    if (win.document.visibilityState === "hidden") return false;
  } catch (err) { /* unknown: treat as visible */ }
  return true;
}

function dssWhenSeen(win, cb) {
  if (dssOnScreen(win)) {
    cb();
    return function () {};
  }

  var doc = win.document;
  var done = false;
  var lateTimer = 0;

  function cleanup() {
    win.clearTimeout(lateTimer);
    doc.removeEventListener("visibilitychange", onChange, true);
    win.removeEventListener("focus", onFocus, true);
    win.removeEventListener("pointerdown", onInput, true);
    win.removeEventListener("keydown", onInput, true);
  }

  function fire() {
    if (done) return;
    done = true;
    cleanup();
    cb();
  }

  function onChange() { if (dssOnScreen(win)) fire(); }
  function onFocus() { if (dssOnScreen(win)) fire(); }
  /* A click or a keystroke inside this window proves somebody is looking at it,
     whatever the visibility bookkeeping believes: play, unconditionally. */
  function onInput() { fire(); }

  /* A window shown without ever taking focus still deserves its opening, so
     fall back to a plain timer — but never play into a hidden window. */
  function armLate() {
    lateTimer = win.setTimeout(function () {
      if (doc.visibilityState === "hidden") { armLate(); return; }
      fire();
    }, 45000);
  }

  doc.addEventListener("visibilitychange", onChange, true);
  win.addEventListener("focus", onFocus, true);
  win.addEventListener("pointerdown", onInput, true);
  win.addEventListener("keydown", onInput, true);
  armLate();

  return function () { done = true; cleanup(); };
}

function SplashOverlay() {
  var hostRef = React.useRef(null);

  React.useEffect(function () {
    var cfg = dssOptions();
    var host = hostRef.current;
    if (!host || dssPlayed || !dssOverlayWanted(cfg)) {
      dssMark("skipped");
      return undefined;
    }
    dssPlayed = true;

    dssInjectStyle();

    var opts = {};
    for (var key in cfg) {
      if (Object.prototype.hasOwnProperty.call(cfg, key)) opts[key] = cfg[key];
    }
    opts.onFinish = function () {
      if (typeof cfg.onFinish === "function") {
        try { cfg.onFinish(); } catch (err) { /* ignore */ }
      }
      dssMark("done");
    };

    var handle = null;
    var alive = true;
    dssMark("waiting");

    var cancelWait = dssWhenSeen(window, function () {
      if (!alive) return;
      if (typeof cfg.beforeMount === "function") {
        try { cfg.beforeMount(); } catch (err) { /* ignore */ }
      }
      handle = mountSplash(host, opts);
      dssMark("playing");
    });

    return function () {
      alive = false;
      if (cancelWait) cancelWait();
      if (handle) handle.destroy();
    };
  }, []);

  /* Read after the hooks so the hook order never depends on the switch. */
  var wanted = dssOverlayWanted(dssOptions());
  if (!wanted) return null;

  var node = React.createElement("div", { ref: hostRef, className: "dss-host" });
  return dssPortal ? dssPortal(node, document.body) : node;
}

function apply(ctx) {
  var slots = ctx.get("slots");
  if (!slots) return;

  var register = function () {
    return slots.register({ name: "shell.overlay", id: "deepseek-splash", order: 90 }, SplashOverlay);
  };

  if (typeof slots.inject === "function") {
    ctx.effect(function () { return slots.inject("shell.overlay", register); }, "deepseek-splash: opening overlay");
  } else {
    ctx.effect(register, "deepseek-splash: opening overlay");
  }
}

exports.apply = apply;
exports.inject = ["slots"];
/* Lets a curious user (or a test) watch the animation again without reloading. */
exports.replay = function () { dssPlayed = false; };
