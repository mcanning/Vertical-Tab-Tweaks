# Firefox Sidebar Tools

This repository reconstructs the project history from the saved Firefox customization files and add-on packages. The tags mark those snapshots.

## Drag Firefox from the built-in vertical tab strip

The [profile stylesheet](firefox/vertical-tab-drag/userChrome.css) targets the blank space between **New Tab** and the bottom tools in Firefox's own vertical sidebar. Firefox tracks built-in support in [bug 1954817](https://bugzilla.mozilla.org/show_bug.cgi?id=1954817).

1. Open `about:support` in Firefox. Next to **Profile Folder**, click **Open Folder**.
2. In that folder, place the stylesheet at `chrome/userChrome.css`. If the file already exists, append the rule to it.
3. Set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true` in `about:config`, then restart Firefox.
4. With vertical tabs on and the window restored, try dragging in the space below **New Tab**.

Remove the rule and restart Firefox to undo it. The Firefox 159.0.1 test profile verified the rule's position, the **New Tab** click, and its exclusion from horizontal and overflowing tab strips. Native window movement still needs a normal Windows window test. [Mozilla's profile stylesheet documentation](https://support.mozilla.org/en-US/kb/contributors-guide-firefox-advanced-customization)

## Zendo Grip add-on

[Zendo Grip](addon/manifest.json) opens a drag-only sidebar panel alongside Firefox's built-in vertical tabs. Drag anywhere inside its panel to move a restored Firefox window.

Run these commands in PowerShell from the repository root to build the unsigned package.

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
Compress-Archive -Path addon\* -DestinationPath dist\zendo-grip-2.0.0.zip -Force
```

In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the ZIP. Then open **Zendo Grip** from the sidebar tools. For a permanent install in Firefox Release, submit the ZIP for [Mozilla's unlisted signing](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/#self-distribution).

## History

| Tag | Snapshot |
| --- | --- |
| `legacy-firefox-profile` | Original native glass, hover dash, and broad drag rules |
| `minus-tab-unloader-v1.0.0` | Standalone toolbar button and keyboard shortcut to unload tabs |
| `glass-tabs-v1.0.0` | Glass Tabs sidebar with hover-to-unload |
| `glass-tabs-v1.1.0` | Window dragging in the Glass Tabs panel |
| `zendo-tabs-v1.2.0` | Zendo Tabs rename and removal of custom glass |
| `zendo-tabs-v1.3.0` | Bottom drag strip and fixes for the unload action on restored tabs |
| `native-dash-trial` | Narrower native hover dash experiment, with the profile name replaced by a placeholder |
| `zendo-tabs-v1.4.0` | Hover unload removed and standard close button restored |
| `zendo-grip-v2.0.0` | Drag-only panel with the tab list and tab permission removed |

The history includes the rollback of both native dash attempts and the original transparency rules. The native dash trials used Firefox's privileged AutoConfig mode.

Firefox's built-in sidebar supplies the pinned-tab grid and the **Unload Tab** context menu. [Firefox vertical tabs help](https://support.mozilla.org/en-US/kb/use-sidebar-access-tools-and-vertical-tabs), [Firefox tab unloading help](https://support.mozilla.org/en-US/kb/unload-tabs-reduce-memory-usage-firefox)

Native Windows Mica and Acrylic were evaluated as Firefox settings. Both used `widget.windows.mica` set to `true`. The `widget.windows.mica.toplevel-backdrop` value was `1` for Mica and `2` for Acrylic. The Acrylic trial set `widget.windows.mica.popups` to `0`. The off comparison set `widget.windows.mica` to `false`.

## Verification

Run with a recent Node.js on Windows. The browser checks use separate test profiles under `.test-profiles`.

```powershell
node tests/firefox-smoke.cjs dist/zendo-grip-2.0.0.zip
node tests/native-sidebar-css.cjs
node tests/sidebar-ui.cjs
```

The first check loads the ZIP in Firefox and tests dragging from the top, middle, and bottom of the add-on panel. The second checks the native stylesheet in Firefox. The last uses Edge to exercise the drag threshold and maximized-window behavior with a mock window API.
