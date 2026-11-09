// ==UserScript==
// @name Native Tab Minus
// @description Hover a native vertical tab's close button to unload it.
// @include chrome://browser/content/browser.xhtml
// ==/UserScript==
(() => {
  if (location.href !== 'chrome://browser/content/browser.xhtml') return;
  function init() {
    if (window.NativeTabMinus || typeof gBrowser?.explicitUnloadTabs !== 'function') return;
    const root = document.documentElement;
    const style = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
    style.id = 'native-tab-minus-style';
    style.textContent = `
      :root[data-native-tab-minus] #tabbrowser-tabs[orient="vertical"] tab:not([pending]) .tab-close-button:hover {
        list-style-image: none !important;
        background-image: linear-gradient(currentColor, currentColor) !important;
        background-size: 10px 1.5px !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }
    `;
    document.documentElement.append(style);
    root.setAttribute('data-native-tab-minus', 'true');
    let busy = false;
    const saved = new Map();
    const attrs = ['data-l10n-id', 'data-l10n-args', 'tooltiptext', 'aria-label'];
    function closeButton(event) {
      if (!gBrowser.tabContainer.verticalMode) return null;
      return event.target.closest?.('.tab-close-button') || null;
    }
    function restore(button) {
      const previous = saved.get(button);
      if (!previous) return;
      for (const [name, value] of previous) {
        if (value === null) button.removeAttribute(name); else button.setAttribute(name, value);
      }
      saved.delete(button);
    }
    function over(event) {
      const button = closeButton(event);
      if (!button) return;
      if (button.closest('tab')?.hasAttribute('pending')) { restore(button); return; }
      if (saved.has(button)) return;
      saved.set(button, attrs.map(name => [name, button.getAttribute(name)]));
      button.removeAttribute('data-l10n-id');
      button.removeAttribute('data-l10n-args');
      const text = 'Unload this tab';
      button.setAttribute('tooltiptext', text);
      button.setAttribute('aria-label', text);
    }
    function out(event) {
      const button = event.target.closest?.('.tab-close-button');
      if (button && !button.contains(event.relatedTarget)) restore(button);
    }
    function click(event) {
      const button = closeButton(event);
      if (!button || event.button !== 0) return;
      const tab = button.closest('tab');
      // Let Firefox close an unloaded tab with its ordinary close-button handler.
      if (tab?.hasAttribute('pending')) { restore(button); return; }
      // Capture before the native tab listener can close a tab or selected group.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type !== 'click' || busy) return;
      if (!tab || tab.closing) return;
      if (!tab.linkedBrowser?.isRemoteBrowser) {
        button.setAttribute('tooltiptext', 'Firefox cannot unload this internal page');
        return;
      }
      busy = true;
      Promise.resolve(gBrowser.explicitUnloadTabs([tab]))
        .catch(error => {
          console.error('Native Tab Minus:', error);
          if (button.isConnected) button.setAttribute('tooltiptext', 'Could not unload this tab');
        })
        .finally(() => { busy = false; });
    }
    // A tab can unload while the pointer stays over its button.
    // Keep the tooltip and accessible label synchronized without requiring mouse movement.
    const stateObserver = new MutationObserver(records => {
      for (const record of records) {
        const button = record.target.querySelector?.('.tab-close-button');
        if (!button) continue;
        if (record.target.hasAttribute('pending')) restore(button);
        else if (button.matches(':hover')) over({ target: button });
      }
    });
    stateObserver.observe(gBrowser.tabContainer, {
      subtree: true, attributes: true, attributeFilter: ['pending']
    });
    // Keeping mouse-down behavior native preserves normal focus and drag handling.
    window.addEventListener('mouseover', over, true);
    window.addEventListener('mouseout', out, true);
    window.addEventListener('click', click, true);
    window.addEventListener('dblclick', click, true);
    window.NativeTabMinus = {
      version: '1.1.0',
      destroy() {
        stateObserver.disconnect();
        window.removeEventListener('mouseover', over, true);
        window.removeEventListener('mouseout', out, true);
        window.removeEventListener('click', click, true);
        window.removeEventListener('dblclick', click, true);
        for (const button of saved.keys()) restore(button);
        style.remove();
        root.removeAttribute('data-native-tab-minus');
        delete window.NativeTabMinus;
      }
    };
  }
  if (window.gBrowserInit?.delayedStartupFinished) init();
  else {
    const observer = (subject, topic) => {
      if (subject !== window) return;
      Services.obs.removeObserver(observer, topic);
      init();
    };
    Services.obs.addObserver(observer, 'browser-delayed-startup-finished');
  }
})();