const fs = require('node:fs');
const path = require('node:path');
const launcherDir = __dirname;
const source = fs.readFileSync(path.join(launcherDir, 'firefox-smoke.cjs'), 'utf8');
const start = source.indexOf("    const addonId =");
const end = source.indexOf("  } finally {", start);
if (start < 0 || end < 0) throw Error('Firefox launcher changed');
process.argv[2] ??= path.join(__dirname, '..', 'dist', 'zendo-grip-menu-switch-0.1.0.zip');
const checks = String.raw`
    const addonId = (await send('Addon:Install', { path: packagePath, temporary: true })).value;
    await context('chrome');
    const mode = 'return getComputedStyle(document.getElementById("tabbrowser-arrowscrollbox-periphery"), "::after").content;';
    assert.equal(await execute(mode), 'none');
    const action = '.unified-extensions-item-action-button[data-extensionid=' + JSON.stringify(addonId) + ']';
    const until = async (check, message) => {
      for (let i = 0; i < 60; i++) {
        if (await check()) return;
        await sleep(100);
      }
      throw Error(message);
    };
    const toggle = async (enabled) => {
      await execute('document.getElementById("unified-extensions-button").click();');
      await until(() => execute(
        'return gUnifiedExtensions.panel.state === "open" && !!document.querySelector("#unified-extensions-area " + arguments[0]);',
        [action],
      ), 'Could not find the switch in the Extensions menu');
      await execute('document.querySelector(arguments[0]).click();', [action]);
      await until(async () => {
        const closed = await execute('return gUnifiedExtensions.panel.state === "closed";');
        const title = await execute('return document.querySelector(arguments[0])?.getAttribute("tooltiptext");', [action]);
        return closed && title === (enabled ? 'Zendo Grip — On' : 'Zendo Grip — Off') &&
          await execute(mode) === (enabled ? '""' : 'none');
      }, 'The menu switch did not change the drag rule');
    };
    await toggle(true);
    await toggle(false);
    await toggle(true);
    await send('Addon:Uninstall', { id: addonId });
    await until(async () => await execute(mode) === 'none', 'The drag rule remained active after uninstall');
    console.log('PASS: the menu switch controls the drag stylesheet after the menu closes and uninstall turns it off.');
`;
const prep = [
  '  fs.mkdirSync(path.join(profile, "chrome"));',
  '  fs.copyFileSync(' + JSON.stringify(path.join(__dirname, '..', 'experiments', 'menu-drag-switch', 'userChrome.css')) + ', path.join(profile, "chrome", "userChrome.css"));',
  '  fs.writeFileSync(path.join(profile, "user.js"), [',
].join('\n');
const run = (source.slice(0, start) + checks + source.slice(end))
  .replace("  fs.writeFileSync(path.join(profile, 'user.js'), [", prep)
  .replace("'user_pref(\"browser.shell.checkDefaultBrowser\", false);',", [
    "'user_pref(\"browser.shell.checkDefaultBrowser\", false);',",
    "'user_pref(\"toolkit.legacyUserProfileCustomizations.stylesheets\", true);',",
    "'user_pref(\"sidebar.verticalTabs\", true);',",
  ].join('\n    '));
new Function('require', '__dirname', run)(require, launcherDir);
