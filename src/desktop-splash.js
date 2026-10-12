/* ============================================================================
   dsh-deepseek-splash — launch-screen bootstrap.
   Runs inside DSH Desktop's own splash page (resources/splash.html) so the
   animation is already playing the moment the window appears, instead of
   waiting for the harness to finish booting and the app shell to load.

   The reveal plays once; afterwards the mark's three dots keep pulsing as the
   loader while the shell writes its boot progress into #progress.
   ========================================================================== */

(function () {
  var stage = document.getElementById("dss-stage");
  if (!stage || typeof mountSplash !== "function") return;

  var theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  var handle = mountSplash(stage, {
    theme: theme,
    /* Nothing to skip to: the app this screen waits for is not running yet. */
    hint: "",
    /* A stray click or key press must not wipe the launch screen either. */
    dismissible: false,
    /* Held until the shell navigates this window to the harness. */
    holdMs: 12 * 60 * 60 * 1000
  });

  window.__DSS_LAUNCH_SPLASH__ = handle;
})();
