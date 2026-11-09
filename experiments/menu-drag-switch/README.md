# Zendo Grip Menu Switch

This experiment adds **Zendo Grip Menu Switch** to Firefox's **Extensions** menu. Clicking it toggles the switch. Its tooltip shows the current state. The Firefox profile stylesheet reads that state and applies the drag rule below **New Tab** in the built-in vertical sidebar.

Install the paired [stylesheet](userChrome.css) in your Firefox profile once using the [profile stylesheet instructions](../../README.md#drag-firefox-from-the-built-in-vertical-tab-strip). If you installed the earlier always-on drag rule, replace that rule with this one.

Build the unsigned test add-on from the repository root.

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
Compress-Archive -Path experiments\menu-drag-switch\extension\* -DestinationPath dist\zendo-grip-menu-switch-0.1.0.zip -Force
```

Load the ZIP through **Load Temporary Add-on** on `about:debugging#/runtime/this-firefox`. Open **Extensions**, click **Zendo Grip Menu Switch**, then try dragging the blank area in a restored Firefox window.

The switch starts off each Firefox session. Firefox creates an unpinned add-on's button when you first open the Extensions menu in each window. With the switch on, open that menu once in each new window to activate the rule there. The experiment relies on Firefox's internal button markup and was checked on Firefox 159.0.1.

After building the ZIP, run `node tests/menu-drag-switch.cjs` from the repository root. The test verifies both switch states after the menu closes and checks that uninstalling the add-on turns the rule off. Actual Windows window movement still needs a normal-window check.
