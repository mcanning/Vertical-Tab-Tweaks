import { canUnload, isVisibleHere, unloadTab } from "./unload.js";
import { enableWindowDrag } from "./window-drag.js";

const { tabs } = browser;
const list = document.querySelector("#tabs");
const template = document.querySelector("#tab-row");
const count = document.querySelector("#count");
const status = document.querySelector("#status");
const newTab = document.querySelector("#new-tab");
const rows = new Map();
let windowId;
let refreshVersion = 0;
let refreshQueued = false;
let operating = false;

function showStatus(message = "") {
  status.textContent = message;
  status.hidden = !message;
}

async function runAction(action, errorMessage, button) {
  if (operating) return;
  operating = true;
  button?.setAttribute("aria-busy", "true");
  showStatus();
  try {
    if (await action() === false) showStatus(errorMessage);
  } catch {
    showStatus(errorMessage);
  } finally {
    operating = false;
    button?.removeAttribute("aria-busy");
    queueRefresh();
  }
}

function actOnTab(id, action) {
  return async () => {
    const tab = await tabs.get(id);
    if (!isVisibleHere(tab, windowId)) return false;
    return action(tab);
  };
}

function closeTab(id, button) {
  return runAction(actOnTab(id, tab => tabs.remove(tab.id)), "Firefox could not close this tab.", button);
}

function createRow(id) {
  const element = template.content.firstElementChild.cloneNode(true);
  const open = element.querySelector(".open-tab");
  const action = element.querySelector(".row-action");
  const image = element.querySelector("img");
  const row = { element, open, action, image, title: element.querySelector(".tab-title"), pin: element.querySelector(".pin") };
  let pressedAction;
  element.dataset.tabId = String(id);

  image.addEventListener("error", () => { image.hidden = true; });
  open.addEventListener("click", () => runAction(
    actOnTab(id, tab => tab.active ? undefined : tabs.update(tab.id, { active: true })),
    "Firefox could not switch to this tab.",
  ));
  element.addEventListener("auxclick", event => {
    if (event.button !== 1) return;
    event.preventDefault();
    closeTab(id, action);
  });
  action.addEventListener("pointerdown", () => { pressedAction = row.kind; });
  action.addEventListener("pointercancel", () => { pressedAction = undefined; });
  action.addEventListener("click", event => {
    // Ignore a second click or a click whose dash changed to an X while pressed.
    const changed = event.detail > 0 && pressedAction !== undefined && pressedAction !== row.kind;
    pressedAction = undefined;
    if (event.detail > 1 || changed) return;
    if (row.kind === "close") {
      closeTab(id, action);
    } else {
      runAction(
        actOnTab(id, tab => tab.discarded || (canUnload(tab) && unloadTab(tabs, tab, windowId))),
        "Firefox kept this tab loaded. If the page has unsaved work, save it and try again.",
        action,
      );
    }
  });
  return row;
}

function updateRow(row, tab) {
  const title = tab.title || "Untitled tab";
  row.kind = canUnload(tab) ? "unload" : "close";
  const actionLabel = row.kind === "unload" ? "Unload tab" : "Close tab";
  row.element.toggleAttribute("data-active", !!tab.active);
  row.element.toggleAttribute("data-discarded", !!tab.discarded);
  row.title.textContent = title;
  row.open.title = title;
  row.open.setAttribute("aria-label", `${title}${tab.pinned ? ", pinned" : ""}${tab.discarded ? ", unloaded" : ""}`);
  if (tab.active) row.open.setAttribute("aria-current", "true");
  else row.open.removeAttribute("aria-current");
  row.pin.toggleAttribute("hidden", !tab.pinned);
  row.action.textContent = row.kind === "unload" ? "−" : "×";
  row.action.title = actionLabel;
  row.action.setAttribute("aria-label", `${actionLabel} ${title}`);

  // Use only inline favicons already provided by Firefox. No site is contacted.
  const icon = /^data:image\//i.test(tab.favIconUrl ?? "") ? tab.favIconUrl : null;
  if (row.image.getAttribute("src") !== icon) {
    if (icon) row.image.src = icon;
    else row.image.removeAttribute("src");
    row.image.hidden = !icon;
  }
}

function render(currentTabs) {
  const focused = document.activeElement;
  const focusedRow = focused?.closest(".tab-row");
  const focusedIndex = focusedRow ? Array.from(list.children).indexOf(focusedRow) : -1;
  const visibleIds = new Set(currentTabs.map(tab => tab.id));
  for (const [id, row] of rows) {
    if (!visibleIds.has(id)) {
      row.element.remove();
      rows.delete(id);
    }
  }

  let cursor = list.firstElementChild;
  for (const tab of currentTabs) {
    let row = rows.get(tab.id);
    if (!row) {
      row = createRow(tab.id);
      rows.set(tab.id, row);
    }
    updateRow(row, tab);
    if (row.element !== cursor) list.insertBefore(row.element, cursor);
    cursor = row.element.nextElementSibling;
  }
  count.textContent = String(currentTabs.length);
  if (focusedRow && !focusedRow.isConnected) {
    const next = list.children[Math.min(focusedIndex, list.children.length - 1)];
    (next?.querySelector(".open-tab") ?? newTab).focus({ preventScroll: true });
  } else if (focusedRow && document.activeElement !== focused) {
    focused.focus({ preventScroll: true });
  }
}

function queueRefresh() {
  refreshVersion++;
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(async () => {
    refreshQueued = false;
    const version = refreshVersion;
    try {
      const currentTabs = await tabs.query({ windowId });
      if (version === refreshVersion) {
        render(currentTabs.filter(tab => isVisibleHere(tab, windowId)).sort((a, b) => a.index - b.index));
      }
    } catch {
      if (version === refreshVersion) showStatus("Could not read the tabs in this window.");
    }
  });
}

list.addEventListener("keydown", event => {
  const row = event.target.closest(".tab-row");
  if (!row || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key === "Delete" && !event.repeat) {
    event.preventDefault();
    closeTab(Number(row.dataset.tabId), row.querySelector(".row-action"));
  }
  const next = {
    ArrowUp: row.previousElementSibling,
    ArrowDown: row.nextElementSibling,
    Home: list.firstElementChild,
    End: list.lastElementChild,
  }[event.key];
  if (next instanceof HTMLElement) {
    event.preventDefault();
    next.querySelector(".open-tab").focus();
  }
});

try {
  ({ id: windowId } = await browser.windows.getCurrent());
  enableWindowDrag(browser.windows, windowId, showStatus);
  newTab.addEventListener("click", () => runAction(
    () => tabs.create({ windowId, active: true }),
    "Firefox could not open a new tab.",
    newTab,
  ));
  const refreshForWindow = info => { if (info.windowId === windowId) queueRefresh(); };
  tabs.onCreated.addListener(refreshForWindow);
  tabs.onUpdated.addListener((_id, _change, tab) => refreshForWindow(tab));
  tabs.onActivated.addListener(refreshForWindow);
  tabs.onMoved.addListener((_id, info) => refreshForWindow(info));
  tabs.onRemoved.addListener((_id, info) => refreshForWindow(info));
  tabs.onAttached.addListener((_id, info) => refreshForWindow({ windowId: info.newWindowId }));
  tabs.onDetached.addListener((_id, info) => refreshForWindow({ windowId: info.oldWindowId }));
  tabs.onReplaced?.addListener(queueRefresh);
  queueRefresh();
} catch {
  newTab.disabled = true;
  showStatus("Glass Tabs could not connect to this Firefox window.");
}
