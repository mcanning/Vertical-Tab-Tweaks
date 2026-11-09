const fs = require('node:fs');
const path = require('node:path');
const work = __dirname;
const launcher = fs.readFileSync(path.join(work, 'firefox-smoke.cjs'), 'utf8');
const from = launcher.indexOf('    const addonId =');
const to = launcher.indexOf('  } finally {', from);
if (from < 0 || to < 0) throw Error('Firefox test launcher changed');
const checks = String.raw`
    await context('chrome');
    await send('WebDriver:SetWindowRect', { x: 120, y: 120, width: 1000, height: 650 });
    const until = async (script, args = []) => {
      for (let i = 0; i < 60; i++) {
        const result = await execute(script, args);
        if (result) return result;
        await sleep(100);
      }
      throw Error('Timed out: ' + script);
    };
    await until('return gBrowser.tabContainer.verticalMode && document.getElementById("tabs-newtab-button").getBoundingClientRect().height > 0;');
    const read = [
      'const periphery = document.getElementById("tabbrowser-arrowscrollbox-periphery");',
      'const button = document.getElementById("tabs-newtab-button");',
      'const after = getComputedStyle(periphery, "::after");',
      'const sheet = InspectorUtils.getAllStyleSheets(document).find(sheet => sheet.href?.endsWith("/userChrome.css"));',
      'return { rules: sheet ? Array.from(sheet.cssRules, rule => rule.cssText) : null, content: after.content, height: parseFloat(after.height), blank: Math.round(periphery.getBoundingClientRect().bottom - button.getBoundingClientRect().bottom) };',
    ].join('\n');
    const bounds = await execute(read);
    console.log('Vertical sidebar:', JSON.stringify(bounds));
    assert.ok(bounds.rules.some(rule => rule.includes('::after') && rule.includes('-moz-window-dragging: drag')));
    assert.ok(bounds.blank > 100);
    assert.ok(bounds.height > 100 && bounds.height <= bounds.blank);
    const point = await execute([
      'const { x, y, width, height } = document.getElementById("tabs-newtab-button").getBoundingClientRect();',
      'return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };',
    ].join('\n'));
    const before = await execute('return gBrowser.tabs.length;');
    await send('WebDriver:PerformActions', {
      actions: [{
        type: 'pointer', id: 'vertical-test-mouse', parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', origin: 'viewport', ...point },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      }],
    });
    await until('return gBrowser.tabs.length === arguments[0] + 1;', [before]);

    await execute('for (let i = 0; i < 30; i++) gBrowser.addTrustedTab("about:blank", { inBackground: true, skipAnimation: true });');
    await until('return document.getElementById("tabbrowser-arrowscrollbox").hasAttribute("overflowing");');
    assert.equal((await execute(read)).content, 'none');
    await execute('Services.prefs.setBoolPref("sidebar.verticalTabs", false);');
    await until('return !gBrowser.tabContainer.verticalMode;');
    assert.equal((await execute(read)).content, 'none');
    console.log('PASS: drag styling fills the area below New Tab, leaves New Tab clickable, and switches off for overflowing or horizontal tabs.');
`;
const prep = [
  '  fs.mkdirSync(path.join(profile, "chrome"));',
  '  fs.copyFileSync(path.join(__dirname, "..", "firefox", "vertical-tab-drag", "userChrome.css"), path.join(profile, "chrome", "userChrome.css"));',
  '  fs.writeFileSync(path.join(profile, "user.js"), [',
].join('\n');
const run = (launcher.slice(0, from) + checks + launcher.slice(to))
  .replace("  fs.writeFileSync(path.join(profile, 'user.js'), [", prep)
  .replace("'user_pref(\"browser.shell.checkDefaultBrowser\", false);',", [
    "'user_pref(\"browser.shell.checkDefaultBrowser\", false);',",
    "'user_pref(\"toolkit.legacyUserProfileCustomizations.stylesheets\", true);',",
    "'user_pref(\"sidebar.verticalTabs\", true);',",
  ].join('\n    '));
new Function('require', '__dirname', run)(require, work);
