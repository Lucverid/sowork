(() => {
  'use strict';
  const TRACKING_KEY = 'agis_finance_v27_tracking';
  const DECISION_KEY = 'agis_finance_v26_decision_lab';

  function installSafeBridges(){
    // v27.4 already owns the correct schema-v27 exporter. v25-features loads later
    // and can replace it with an older schema. Restore the v27.4 exporter only;
    // no finance calculations or rendering code are changed here.
    if (typeof window.__v2753CanonicalBackup === 'function') {
      window.exportBackup = window.__v2753CanonicalBackup;
    }

    // Keep Factory Reset complete without modifying the stable v25 module itself.
    const old = window.factoryResetV245;
    if (typeof old === 'function' && !old.__v2753Safe) {
      const wrapped = async function(){
        const result = await old.apply(this, arguments);
        if (result === true) {
          try { localStorage.removeItem(TRACKING_KEY); } catch {}
          try { localStorage.removeItem(DECISION_KEY); } catch {}
          try { window.refreshTrackingV27?.(); } catch {}
        }
        return result;
      };
      wrapped.__v2753Safe = true;
      window.factoryResetV245 = wrapped;
    }
  }

  function boot(){
    setTimeout(installSafeBridges, 420);
    setTimeout(installSafeBridges, 1100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
