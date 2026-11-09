# Vertical Tab Tweaks for Firefox

Drag the Firefox window from the blank area below **New Tab** or from the gaps around the bottom sidebar icons. Click the hover dash or middle-click a vertical tab to unload it. Middle-click an empty or unloaded tab to close it. **Vertical Tab Tweaks** appears in the Extensions section of Firefox's Add-ons Manager.

## Window dragging

1. Open `about:support` in Firefox and use **Profile Folder → Open Folder**.
2. In that folder, place [the drag stylesheet](firefox/vertical-tab-drag/userChrome.css) at `chrome/userChrome.css`. If a stylesheet exists, append this rule to it.
3. Set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true` in `about:config` or add the setting from [the profile preference file](firefox/vertical-tab-drag/user.js) to the profile's `user.js`. Restart Firefox.
4. Drag the blank area between **New Tab** and the divider. The rule applies where the vertical tab list has room below New Tab.

Remove the rule and restart Firefox to undo the drag customization. If you used the supplied `user.js` setting, you can remove that line and reset the preference in `about:config` when your profile has no other custom stylesheets. Mozilla tracks built-in support in [Firefox bug 1954817](https://bugzilla.mozilla.org/show_bug.cgi?id=1954817).

## Tab unloading

The [native dash files](firefox/native-tab-dash/) use Firefox AutoConfig on Windows. They also make the gaps between and beside the bottom tools draggable while the icons remain clickable. The startup preference disables the AutoConfig script sandbox and gives the local configuration script full Firefox privileges.

1. Close Firefox.
2. Make a copy of `native-tab-minus.cfg` and replace `YOUR_PROFILE_DIRECTORY` with the last folder name from **Profile Folder**.
3. Copy the configured file to `C:\Program Files\Mozilla Firefox\native-tab-minus.cfg`.
4. Copy `native-tab-minus-prefs.js` to `C:\Program Files\Mozilla Firefox\defaults\pref\`. If Firefox already has an AutoConfig setup, stop before changing it.
5. Open Firefox. Hover over an unpinned web tab and click **−** to unload it, even if it is still loading. Hover over an empty **New Tab** or an unloaded tab and click **×** to close it. With the profile stylesheet enabled, the title dims and the favicon turns grayscale until the tab reloads.
6. Middle-click a web tab in the vertical tab list to unload it, including pinned tabs and tabs still loading. An empty **New Tab** or an unloaded tab closes on the first middle-click. Firefox pages that cannot unload stay open.

To undo it, close Firefox and remove the preferences file first, then the configuration file. [Mozilla's AutoConfig documentation](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig)

## Vertical Tab Tweaks tracking entry

Put [the Add-ons Manager stylesheet](firefox/addons-page/userContent.css) at `chrome/userContent.css` in your Firefox profile folder. If the file already exists, append the rule to it. Use the custom stylesheets preference from the window dragging instructions and restart Firefox.

Open `about:addons` and select **Extensions** to see the local tracking label above the list. Remove the rule and restart Firefox to hide the label.

## What loads after a Firefox restart

When Firefox restores the previous session, it loads the selected tab and normally keeps other unpinned tabs unloaded until you select them. Pinned tabs load at startup by default. Firefox's `browser.sessionstore.restore_pinned_tabs_on_demand` preference can defer background pinned tabs too.

## Verification

Run `node tests/firefox-smoke.cjs` on Windows. The test copies Firefox into a disposable workspace directory and checks the blank drag region, **New Tab** and Settings clicks, tab unloading, and the Add-ons Manager label. A separate Windows hit test confirmed that the gap below the divider is draggable and the Settings icon is clickable.

## Git history

The history was reconstructed from saved files and add-on packages. The tags `legacy-firefox-profile`, `native-dash-trial`, `minus-tab-unloader-v1.0.0`, `glass-tabs-v1.0.0`, `glass-tabs-v1.1.0`, `zendo-tabs-v1.2.0` through `zendo-tabs-v1.4.0`, and `zendo-grip-v2.0.0` identify earlier snapshots. The menu-switch prototype is in commit `4fec3f2`.

The earlier glass trial used Firefox's native Windows backdrop. The `widget.windows.mica.toplevel-backdrop` value was `1` for Mica and `2` for Acrylic. The Acrylic trial set `widget.windows.mica.popups` to `0`. The off comparison set `widget.windows.mica` to `false`.
