import { enableWindowDrag } from "./window-drag.js";

const status = document.querySelector("#status");

function showStatus(message = "") {
  status.textContent = message;
  status.hidden = !message;
}

try {
  const { id } = await browser.windows.getCurrent();
  enableWindowDrag(browser.windows, id, showStatus);
} catch {
  showStatus("Zendo Grip could not connect to this Firefox window.");
}
