(() => {
  const noop = () => {};
  const resolved = () => Promise.resolve();
  const resolvedObj = () => Promise.resolve({});
  const resolvedFalse = () => Promise.resolve(false);
  const resolvedTrue = () => Promise.resolve(true);
  window.PokiSDK = {
    init: resolved,
    initWithVideoHB: resolved,
    customEvent: noop,
    destroyAd: noop,
    displayAd: noop,
    getLeaderboard: resolvedObj,
    rewardedBreak: resolvedFalse,
    commercialBreak: resolvedFalse,
    disableProgrammatic: noop,
    gameLoadingStart: noop,
    gameLoadingFinished: noop,
    gameInteractive: noop,
    roundStart: noop,
    roundEnd: noop,
    muteAd: noop,
    setDebug: noop,
    gameplayStart: () => { try { window.__ssGameplayStart && window.__ssGameplayStart(); } catch (e) {} },
    gameplayStop: () => { try { window.__ssGameplayStop && window.__ssGameplayStop(); } catch (e) {} },
    gameLoadingProgress: noop,
    happyTime: noop,
    setPlayerAge: noop,
    togglePlayerAdvertisingConsent: noop,
    toggleNonPersonalized: noop,
    setConsentString: noop,
    logError: noop,
    sendHighscore: noop,
    setDebugTouchOverlayController: noop,
  };
  // Expose window.commercialBreak helper used by Unity
  window.commercialBreak = (cb) => { try { cb && cb(); } catch(e){} return Promise.resolve(); };
})();