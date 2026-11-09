# Firefox Sidebar Tools

Drag the Firefox window from the blank area below **New Tab** in its built-in vertical sidebar. Hover over a loaded, unpinned tab and click **−** to unload it. **Sidebar Grab** is the tracking entry in Firefox's Extensions list.

## Window dragging

1. Open `about:support` in Firefox and use **Profile Folder → Open Folder**.
2. In that folder, place [the drag stylesheet](firefox/vertical-tab-drag/userChrome.css) at `chrome/userChrome.css`. If a stylesheet exists, append this rule to it.
3. Set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true` in `about:config` or add the setting from [the profile preference file](firefox/vertical-tab-drag/user.js) to the profile's `user.js`. Restart Firefox.
4. Drag the blank area between **New Tab** and the bottom tools. The rule applies where the vertical tab list has room below New Tab.

Remove the rule and restart Firefox to undo the drag customization. If you used the supplied `user.js` setting, you can remove that line and reset the preference in `about:config` when your profile has no other custom stylesheets. Mozilla tracks built-in support in [Firefox bug 1954817](https://bugzilla.mozilla.org/show_bug.cgi?id=1954817).

## Hover dash

The [native dash files](firefox/native-tab-dash/) use Firefox AutoConfig on Windows. The startup preference disables the AutoConfig script sandbox and gives the local configuration script full Firefox privileges. This is the mechanism for Firefox Release.

1. Close Firefox.
2. Make a copy of `native-tab-minus.cfg` and replace `YOUR_PROFILE_DIRECTORY` with the last folder name from **Profile Folder**.
3. Copy the configured file to `C:\Program Files\Mozilla Firefox\native-tab-minus.cfg`.
4. Copy `native-tab-minus-prefs.js` to `C:\Program Files\Mozilla Firefox\defaults\pref\`. If Firefox already has an AutoConfig setup, stop before changing it.
5. Open Firefox. Hover over a loaded, unpinned tab. Clicking **−** unloads that tab, and Firefox shows **×** afterward.

To undo it, close Firefox and remove the preferences file first, then the configuration file. [Mozilla's AutoConfig documentation](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig)

## Sidebar Grab tracking entry

The [add-on](addon/manifest.json) consists of metadata and an icon. Its description in `about:addons` records the native customizations. Install it for a named row in the Extensions menu.

Build the unsigned package in PowerShell from the repository root.

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
Compress-Archive -Path addon\* -DestinationPath dist\sidebar-grab-marker-1.1.0.zip -Force
```

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the ZIP. For a persistent entry in Firefox Release, submit the ZIP for [Mozilla's unlisted signing](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/#self-distribution).

## Verification

After building the marker ZIP, run `node tests/firefox-smoke.cjs` on Windows. The test copies Firefox into a disposable workspace directory and checks the blank drag region, **New Tab** click, dash and unload behavior, and Extensions menu entry in the same Firefox session. Window movement still needs a check in a normal Firefox window.

## Git history

The history was reconstructed from saved files and add-on packages. The tags `legacy-firefox-profile`, `native-dash-trial`, `minus-tab-unloader-v1.0.0`, `glass-tabs-v1.0.0`, `glass-tabs-v1.1.0`, `zendo-tabs-v1.2.0` through `zendo-tabs-v1.4.0`, and `zendo-grip-v2.0.0` identify earlier snapshots. The menu-switch prototype is in commit `4fec3f2`.

The earlier glass trial used Firefox's native Windows backdrop. The `widget.windows.mica.toplevel-backdrop` value was `1` for Mica and `2` for Acrylic. The Acrylic trial set `widget.windows.mica.popups` to `0`. The off comparison set `widget.windows.mica` to `false`.
