# Vertical Tab Tweaks

Move the Firefox window from the sidebar and unload tabs without closing them. Vertical Tab Tweaks works with Firefox’s built-in vertical tabs on Windows.

## Using it

**Move the window.** Drag the blank space below **New Tab** or the gaps around the icons at the bottom of the sidebar.

| Tab | Hover button | Middle-click |
| --- | --- | --- |
| Unpinned web tab, even while loading | Click **−** to unload | Unload |
| Empty **New Tab** or an unloaded tab | Click **×** to close | Close |

Unloading keeps the tab in your sidebar. Its title dims and its icon turns gray until you select it again. Use middle-click to unload a pinned web tab.

## Set up on Windows

Download the project using **Code → Download ZIP** on GitHub, then unzip it. Tested with Firefox 159.0.1.

### 1. Find your Firefox profile

1. Right-click the tab bar and choose **Turn on Vertical Tabs** if you use horizontal tabs. [Mozilla’s vertical tabs guide](https://support.mozilla.org/en-US/kb/use-sidebar-access-tools-and-vertical-tabs)
2. Open `about:support` in Firefox. Next to **Profile Folder**, click **Open Folder**. Write down the name of the folder that opens, such as `abc123.default-release`.
3. Open `about:config` and set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true`.

### 2. Add the sidebar styles

In your Firefox profile folder, create a folder named `chrome` if needed. Copy the styles below into it. If a file already exists, add the downloaded CSS to the end of that file.

| File | What it adds |
| --- | --- |
| [userChrome.css](firefox/vertical-tab-drag/userChrome.css) | Dragging below **New Tab**, dimmed titles, and gray icons for unloaded tabs |
| [userContent.css](firefox/addons-page/userContent.css) | An optional **Vertical Tab Tweaks** label above the list in `about:addons` → **Extensions** |

### 3. Add the hover button and middle-click actions

This step uses Firefox AutoConfig to run a local script with full browser privileges. If Firefox already uses AutoConfig, check that setup before adding these files. Windows may ask for administrator approval when you copy them. [Mozilla’s AutoConfig guide](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig)

1. Close Firefox.
2. Open a copy of [native-tab-minus.cfg](firefox/native-tab-dash/native-tab-minus.cfg) in a text editor. Replace `YOUR_PROFILE_DIRECTORY` with the profile folder name you noted in step 1, then save the file.
3. Copy the edited `native-tab-minus.cfg` into your Firefox installation folder, usually `C:\Program Files\Mozilla Firefox`.
4. Copy [native-tab-minus-prefs.js](firefox/native-tab-dash/native-tab-minus-prefs.js) into the `defaults\pref` folder inside that same installation folder.
5. Open Firefox. You can now use the tab controls and drag the window from the gaps around the bottom icons.

## Remove it

1. Close Firefox.
2. In the Firefox installation folder, remove `defaults\pref\native-tab-minus-prefs.js` first, then `native-tab-minus.cfg`.
3. In your profile’s `chrome` folder, remove the CSS added by this project. If you used the supplied `user.js`, remove its stylesheet setting from your profile’s `user.js`.
4. Open Firefox. If you have no other custom stylesheets, reset `toolkit.legacyUserProfileCustomizations.stylesheets` in `about:config`.

<details>
<summary>What happens when Firefox restores tabs?</summary>

Firefox loads the selected tab and normally waits until you select the other unpinned tabs. To make background pinned tabs wait too, set `browser.sessionstore.restore_pinned_tabs_on_demand` to `true` in `about:config`.

</details>

<details>
<summary>Tests and earlier experiments</summary>

Run `node tests/firefox-smoke.cjs` from the project folder on Windows. The test uses a separate Firefox copy and profile to check the tab controls, sidebar dragging rules, and Add-ons Manager label.

Earlier versions and experiments are saved in the [project’s Git tags](https://github.com/mcanning/Vertical-Tab-Tweaks/tags).

</details>
