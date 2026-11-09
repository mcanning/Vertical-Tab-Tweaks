let changing = false;

browser.action.onClicked.addListener(async () => {
  if (changing) return;
  changing = true;
  try {
    const badge = await browser.action.getBadgeText({});
    const enabled = badge !== "ON";
    await browser.action.setBadgeText({ text: enabled ? "ON" : "" });
    await browser.action.setTitle({ title: enabled ? "Zendo Grip — On" : "Zendo Grip — Off" });
  } finally {
    changing = false;
  }
});
