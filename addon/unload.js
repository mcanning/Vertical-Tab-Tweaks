export function canUnload(tab) {
  return !tab.discarded && /^(https?:|file:|data:|blob:|about:reader\?)/i.test(tab.url ?? "");
}

export function isVisibleHere(tab, windowId) {
  return tab.windowId === windowId && !tab.hidden;
}

export async function unloadTab(tabs, target, windowId) {
  if (target.active) {
    const candidates = (await tabs.query({ windowId }))
      .filter(tab => tab.id !== target.id && isVisibleHere(tab, windowId))
      .sort((a, b) => Number(!!a.discarded) - Number(!!b.discarded)
        || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)
        || Math.abs(a.index - target.index) - Math.abs(b.index - target.index));

    // The user may have switched, moved, or unloaded the tab during the query.
    const current = await tabs.get(target.id);
    if (!isVisibleHere(current, windowId)) return false;
    if (!canUnload(current)) return !!current.discarded;
    if (current.active) {
      if (candidates.length) {
        const next = await tabs.get(candidates[0].id);
        if (!isVisibleHere(next, windowId)) return false;
        const stillActive = await tabs.get(target.id);
        if (!isVisibleHere(stillActive, windowId)) return false;
        if (stillActive.active) await tabs.update(next.id, { active: true });
      } else {
        await tabs.create({ windowId, url: "about:blank", active: true });
      }
    }
  }

  const before = await tabs.get(target.id);
  if (!isVisibleHere(before, windowId) || before.active) return false;
  if (!canUnload(before)) return !!before.discarded;

  await tabs.discard(before.id);
  // Firefox may resolve the request without unloading a page with unsaved work.
  return !!(await tabs.get(before.id)).discarded;
}
