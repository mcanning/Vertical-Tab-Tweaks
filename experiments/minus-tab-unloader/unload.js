"use strict";

// Only the tabs API is used. No URLs, page contents, or browsing history are read.
async function unloadTab(tabs, tabId) {
  const target = await tabs.get(tabId);
  if (target.discarded) return;

  if (target.active) {
    const candidates = (await tabs.query({ windowId: target.windowId }))
      .filter(tab => tab.id !== target.id && !tab.hidden)
      .sort((a, b) => Number(a.discarded) - Number(b.discarded)
        || (b.lastAccessed || 0) - (a.lastAccessed || 0)
        || Math.abs(a.index - target.index) - Math.abs(b.index - target.index));

    // Do not change focus if the user switched tabs while the query was running.
    const current = await tabs.get(tabId);
    if (current.windowId !== target.windowId) {
      throw new Error("Tab moved to another window. Try again.");
    }
    if (current.active) {
      if (candidates.length) {
        await tabs.update(candidates[0].id, { active: true });
      } else {
        // Firefox needs an active tab even when this was the only visible tab.
        await tabs.create({ windowId: target.windowId, url: "about:blank", active: true });
      }
    }
  }

  const before = await tabs.get(tabId);
  if (before.discarded) return;
  if (before.active) throw new Error("Tab is active again. Try again.");
  if (before.windowId !== target.windowId) {
    throw new Error("Tab moved to another window. Try again.");
  }
  await tabs.discard(tabId);
  // Firefox can resolve without discarding (for example, unsaved-work protection).
  if (!(await tabs.get(tabId)).discarded) {
    throw new Error("Firefox kept this tab loaded. Save any unfinished work and try again.");
  }
}
