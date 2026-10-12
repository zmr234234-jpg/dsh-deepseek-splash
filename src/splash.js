/* ============================================================================
   dsh-deepseek-splash — animation runtime (framework-free).
   Build input: concatenated into lib/client.js, where WHALE_SVG is defined.
   Public entry: mountSplash(hostElement, options) -> { root, skip, destroy }
   ========================================================================== */

var DSS_BUBBLES = [
  /* left,  size(px), delay(ms), duration(ms), rise(px) */
  ["17%", 8, 320, 2500, 150],
  ["26%", 5, 980, 2100, 118],
  ["37%", 10, 40, 2700, 196],
  ["45%", 4, 1760, 1900, 108],
  ["53%", 6, 1360, 2300, 142],
  ["64%", 9, 520, 2600, 172],
  ["75%", 5, 1140, 2000, 126],
  ["84%", 7, 240, 2400, 158]
];

function dssEscape(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dssDetectTheme(doc, win) {
  try {
    var el = doc.documentElement;
    var attr = String(
      el.getAttribute("data-theme") ||
      el.getAttribute("data-dsh-theme") ||
      el.getAttribute("data-color-mode") ||
      (el.dataset && el.dataset.theme) || ""
    ).toLowerCase();
    if (attr.indexOf("light") !== -1) return "light";
    if (attr.indexOf("dark") !== -1) return "dark";
    var cls = (String(el.className) + " " + String(doc.body ? doc.body.className : "")).toLowerCase();
    if (/\blight\b|theme-light|is-light/.test(cls)) return "light";
    if (/\bdark\b|theme-dark|is-dark/.test(cls)) return "dark";
    var bg = win.getComputedStyle(doc.body || el).backgroundColor || "";
    var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bg);
    if (m) {
      var lum = 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
      return lum > 150 ? "light" : "dark";
    }
  } catch (err) { /* fall through to the media query */ }
  try {
    if (win.matchMedia && win.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch (err2) { /* ignore */ }
  return "dark";
}

function mountSplash(host, options) {
  var opts = options || {};
  var noop = { root: null, skip: function () {}, destroy: function () {} };
  if (!host || !host.ownerDocument) return noop;

  var doc = host.ownerDocument;
  var win = doc.defaultView || window;
  var reduced = !!opts.reduced;
  if (!reduced) {
    try {
      reduced = !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (err) { reduced = false; }
  }
  var theme = opts.theme || dssDetectTheme(doc, win);

  var bubbles = "";
  for (var i = 0; i < DSS_BUBBLES.length; i++) {
    var b = DSS_BUBBLES[i];
    bubbles += '<span class="dss-bubble" style="left:' + b[0] + ";width:" + b[1] + "px;height:" + b[1] +
      "px;animation-delay:" + b[2] + "ms;animation-duration:" + b[3] + "ms;--dss-rise:" + b[4] + 'px"></span>';
  }

  var title = opts.title === undefined ? "DeepSeek" : opts.title;
  var subtitle = opts.subtitle === undefined ? "深度求索" : opts.subtitle;
  var hint = opts.hint === undefined ? "点击任意位置跳过" : opts.hint;

  host.innerHTML =
    '<div class="dss-root' + (reduced ? " dss-reduced" : "") + '" data-theme="' + theme +
    '" role="presentation" aria-hidden="true">' +
      '<div class="dss-aurora dss-aurora-a"></div>' +
      '<div class="dss-aurora dss-aurora-b"></div>' +
      '<div class="dss-grid"></div>' +
      '<div class="dss-center">' +
        '<div class="dss-mark">' +
          '<div class="dss-halo"></div>' +
          '<div class="dss-ring"></div>' +
          WHALE_SVG +
          '<div class="dss-sheen"></div>' +
        '</div>' +
        '<div class="dss-word">' +
          '<div class="dss-word-main">' + dssEscape(title) + "</div>" +
          (subtitle ? '<div class="dss-word-sub">' + dssEscape(subtitle) + "</div>" : "") +
        "</div>" +
      "</div>" +
      '<div class="dss-bubbles">' + bubbles + "</div>" +
      (hint ? '<div class="dss-hint">' + dssEscape(hint) + "</div>" : "") +
    "</div>";

  var root = host.querySelector(".dss-root");
  if (!root) return noop;

  /* An explicit hold always wins: the desktop splash has to stay up for as long
     as the app takes to boot, reduced motion or not. */
  var holdMs = opts.holdMs || (reduced ? 420 : 2760);
  var exitMs = reduced ? 160 : (opts.exitMs || 560);
  var leaving = false;
  var destroyed = false;
  var autoTimer = win.setTimeout(finish, holdMs);
  var exitTimer = 0;

  function finish() {
    if (leaving || destroyed) return;
    leaving = true;
    win.clearTimeout(autoTimer);
    root.classList.add("is-leaving");
    exitTimer = win.setTimeout(destroy, exitMs);
  }

  function onKey(event) {
    var key = event.key;
    if (key === "Escape" || key === "Esc" || key === "Enter" || key === " " || key === "Spacebar") {
      /* The curtain is opaque: never let the dismissing key reach the app
         underneath, or the user would type blind into a hidden editor. */
      if (event.preventDefault) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      finish();
    }
  }
  function onPointer(event) {
    if (event.stopPropagation) event.stopPropagation();
    finish();
  }

  /* The desktop splash is not a curtain over an already-running app: there is
     nothing behind it to skip to, so it accepts no dismissal input at all. */
  var dismissible = opts.dismissible !== false;
  if (dismissible) {
    root.addEventListener("pointerdown", onPointer, true);
    root.addEventListener("click", onPointer, true);
    win.addEventListener("keydown", onKey, true);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    win.clearTimeout(autoTimer);
    win.clearTimeout(exitTimer);
    root.removeEventListener("pointerdown", onPointer, true);
    root.removeEventListener("click", onPointer, true);
    win.removeEventListener("keydown", onKey, true);
    if (root.parentNode) root.parentNode.removeChild(root);
    if (typeof opts.onFinish === "function") {
      try { opts.onFinish(); } catch (err) { /* never break the host app */ }
    }
  }

  return { root: root, skip: finish, destroy: destroy };
}
