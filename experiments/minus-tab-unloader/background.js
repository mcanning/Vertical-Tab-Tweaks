"use strict";

let busy = false;
const defaultTitle = "Unload current tab (Alt+Shift+U)";

async function runUnload(tab) {
  if (busy || !Number.isInteger(tab?.id)) return;
  busy = true;
  try {
    await browser.action.setBadgeText({ text: "" });
    await browser.action.setTitle({ title: defaultTitle });
    await unloadTab(browser.tabs, tab.id);
  } catch (error) {
    console.warn("Tab unload did not complete:", error);
    await browser.action.setBadgeBackgroundColor({ color: "#b33b28" });
    await browser.action.setBadgeText({ text: "!" });
    await browser.action.setTitle({
      title: "Could not unload tab. " + (error.message || "Try again.")
    });
  } finally {
    busy = false;
  }
}

browser.action.onClicked.addListener(tab => {
  runUnload(tab).catch(console.error);
});

browser.commands.onCommand.addListener(async command => {
  if (command !== "unload-current-tab") return;
  try {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    await runUnload(tab);
  } catch (error) {
    console.error("Could not find the active tab:", error);
  }
});
