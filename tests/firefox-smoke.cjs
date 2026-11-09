const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const project = path.resolve(__dirname, '..');
const profileRoot = path.join(project, '.test-profiles');
fs.mkdirSync(profileRoot, { recursive: true });
const runDirectory = fs.mkdtempSync(path.join(profileRoot, 'firefox-'));
const profile = path.join(runDirectory, 'sidebar-grab-test');
const packagePath = path.resolve(process.argv[2] || path.join(project, 'dist/sidebar-grab-marker-1.1.0.zip'));

function prepareFirefox() {
  const source = String.raw`C:\Program Files\Mozilla Firefox`;
  const install = path.join(runDirectory, 'app');
  fs.mkdirSync(install);
  for (const file of fs.readdirSync(source, { withFileTypes: true })) {
    if (file.isFile() && file.name !== 'native-tab-minus.cfg') {
      fs.copyFileSync(path.join(source, file.name), path.join(install, file.name));
    }
  }
  for (const name of ['browser', 'fonts', 'gmp-clearkey', 'installation_dir_layout']) {
    if (fs.existsSync(path.join(source, name))) fs.cpSync(path.join(source, name), path.join(install, name), { recursive: true });
  }
  const defaults = path.join(install, 'defaults', 'pref');
  fs.mkdirSync(defaults, { recursive: true });
  fs.copyFileSync(path.join(source, 'defaults', 'pref', 'channel-prefs.js'), path.join(defaults, 'channel-prefs.js'));
  const nativeDash = path.join(project, 'firefox', 'native-tab-dash');
  const cfg = fs.readFileSync(path.join(nativeDash, 'native-tab-minus.cfg'), 'utf8');
  fs.writeFileSync(path.join(install, 'native-tab-minus.cfg'), cfg.replace('YOUR_PROFILE_DIRECTORY', path.basename(profile)));
  fs.copyFileSync(path.join(nativeDash, 'native-tab-minus-prefs.js'), path.join(defaults, 'native-tab-minus-prefs.js'));
  return path.join(install, 'firefox.exe');
}

async function availablePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function main() {
  const executable = prepareFirefox();
  const chrome = path.join(profile, 'chrome');
  const drag = path.join(project, 'firefox', 'vertical-tab-drag');
  fs.mkdirSync(chrome, { recursive: true });
  fs.copyFileSync(path.join(drag, 'userChrome.css'), path.join(chrome, 'userChrome.css'));
  const port = await availablePort();
  fs.writeFileSync(path.join(profile, 'user.js'), [
    fs.readFileSync(path.join(drag, 'user.js'), 'utf8').trimEnd(),
    `user_pref("marionette.port", ${port});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("sidebar.verticalTabs", true);',
    'user_pref("browser.tabs.warnOnClose", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");'
  ].join('\n'));
  const appData = path.join(profile, 'appdata');
  const localData = path.join(profile, 'localdata');
  fs.mkdirSync(appData);
  fs.mkdirSync(localData);
  const log = fs.openSync(path.join(profile, 'process.log'), 'a');
  const firefox = spawn(executable,
    ['--headless', '--no-remote', '--profile', profile, '--marionette', '--remote-allow-system-access', 'about:blank'],
    { windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1', MOZ_CRASHREPORTER_DISABLE: '1', APPDATA: appData, LOCALAPPDATA: localData } });
  let socket;
  try {
    for (let attempt = 0; attempt < 48; attempt++) {
      try {
        socket = await new Promise((resolve, reject) => {
          const candidate = net.connect(port, '127.0.0.1');
          candidate.once('connect', () => resolve(candidate));
          candidate.once('error', reject);
        });
        break;
      } catch (_) { await sleep(250); }
    }
    if (!socket) throw new Error('Firefox did not start: ' + fs.readFileSync(path.join(profile, 'process.log'), 'utf8'));
    let buffer = Buffer.alloc(0), serial = 0;
    const pending = new Map();
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const colon = buffer.indexOf(58);
        if (colon < 0) return;
        const length = Number(buffer.subarray(0, colon).toString());
        if (buffer.length < colon + 1 + length) return;
        const packet = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length).toString());
        buffer = buffer.subarray(colon + 1 + length);
        if (Array.isArray(packet)) {
          const waiter = pending.get(packet[1]);
          if (waiter) {
            pending.delete(packet[1]); clearTimeout(waiter.timeout);
            packet[2] ? waiter.reject(new Error(JSON.stringify(packet[2]))) : waiter.resolve(packet[3]);
          }
        }
      }
    });
    const send = (command, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Timeout: ' + command)); }, 30000);
      pending.set(id, { resolve, reject, timeout });
      const bytes = Buffer.from(JSON.stringify([0, id, command, params]));
      socket.write(Buffer.concat([Buffer.from(bytes.length + ':'), bytes]));
    });
    const context = value => send('Marionette:SetContext', { value });
    const execute = async (script, args = []) => (await send('WebDriver:ExecuteScript', { script, args, sandbox: null, newSandbox: true })).value;
    console.log('Session', JSON.stringify(await send('WebDriver:NewSession', { capabilities: { acceptInsecureCerts: false, pageLoadStrategy: 'eager' } })));
    await send('WebDriver:SetTimeouts', { pageLoad: 20000, script: 20000, implicit: 2000 });
    await context('chrome');
    await send('WebDriver:SetWindowRect', { x: 120, y: 120, width: 1100, height: 750 });

    const until = async (script, args = []) => {
      for (let i = 0; i < 60; i++) {
        const result = await execute(script, args);
        if (result) return result;
        await sleep(100);
      }
      throw Error('Timed out: ' + script);
    };
    await until('return !!document.getElementById("native-tab-minus-style") && gBrowser.tabContainer.verticalMode;');

    const region = await execute(`
      const periphery = document.getElementById('tabbrowser-arrowscrollbox-periphery');
      const button = document.getElementById('tabs-newtab-button').getBoundingClientRect();
      const target = getComputedStyle(periphery, '::after');
      return { height: parseFloat(target.height), available: periphery.getBoundingClientRect().bottom - button.bottom };
    `);
    assert.ok(region.height > 100 && region.height <= region.available + 1);
    const pointer = actions => send('WebDriver:PerformActions', {
      actions: [{ type: 'pointer', id: 'sidebar-grab-mouse', parameters: { pointerType: 'mouse' }, actions }],
    });
    const center = selector => execute(`
      const { x, y, width, height } = document.querySelector(arguments[0]).getBoundingClientRect();
      return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
    `, [selector]);
    const clickAt = async point => pointer([
      { type: 'pointerMove', origin: 'viewport', ...point },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerUp', button: 0 },
    ]);
    const before = await execute('return gBrowser.tabs.length;');
    await clickAt(await center('#tabs-newtab-button'));
    await until('return gBrowser.tabs.length === arguments[0] + 1;', [before]);
    console.log('PASS: the blank-area CSS loads and New Tab remains clickable.');

    await execute(`
      const page = 'data:text/html,' + encodeURIComponent('<title>Dash check</title><p>Dash check</p>');
      const tabs = {
        loaded: gBrowser.addTrustedTab(page, { inBackground: true }),
        pinned: gBrowser.addTrustedTab(page, { inBackground: true, pinned: true }),
        internal: gBrowser.addTrustedTab('about:preferences', { inBackground: true }),
        restored: gBrowser.addTrustedTab(page, {
          inBackground: true, createLazyBrowser: true, lazyTabTitle: 'Restored on demand',
        }),
      };
      for (const [name, tab] of Object.entries(tabs)) tab.setAttribute('data-test-tab', name);
    `);
    const tabSelector = name => '[data-test-tab="' + name + '"]';
    const closeSelector = name => tabSelector(name) + ' .tab-close-button';
    const icon = name => execute(
      'return getComputedStyle(document.querySelector(arguments[0])).listStyleImage;', [closeSelector(name)],
    );
    async function hover(name) {
      const selector = tabSelector(name);
      await until(`
        const tab = document.querySelector(arguments[0]);
        return tab.getBoundingClientRect().height > 0 && !tab.hasAttribute('busy');
      `, [selector]);
      await pointer([{ type: 'pointerMove', origin: 'viewport', ...await center(selector) }]);
      await until('return document.querySelector(arguments[0]).matches(":hover");', [selector]);
    }
    for (const name of ['pinned', 'internal', 'restored']) {
      await hover(name);
      assert.match(await icon(name), /close-12/);
    }
    await hover('loaded');
    assert.match(await icon('loaded'), /minus\.svg/);
    await clickAt(await center(closeSelector('loaded')));
    await until('return document.querySelector(arguments[0])?.hasAttribute("pending");', [tabSelector('loaded')]);
    assert.match(await icon('loaded'), /close-12/);
    await execute('gBrowser.selectedTab = document.querySelector(arguments[0]);', [tabSelector('restored')]);
    await hover('restored');
    await until('return document.querySelector(arguments[0]).hasAttribute("data-native-tab-minus");', [closeSelector('restored')]);
    console.log('PASS: the native dash unloads a tab and the normal close icon returns.');

    const addonId = (await send('Addon:Install', { path: packagePath, temporary: true })).value;
    assert.equal(addonId, 'sidebar-grab-marker@firefox-sidebar-tools.invalid');
    await execute('document.getElementById("unified-extensions-button").click();');
    await until(`
      const row = Array.from(document.querySelectorAll('unified-extensions-item'))
        .find(node => node.extension?.id === arguments[0]);
      return row?.querySelector('.unified-extensions-item-name')?.textContent === 'Sidebar Grab';
    `, [addonId]);
    await execute('gUnifiedExtensions.panel.hidePopup();');
    await send('Addon:Uninstall', { id: addonId });
    assert.equal(await execute('return !!document.getElementById("native-tab-minus-style");'), true);
    console.log('PASS: the tracking-only marker appears in Extensions and the native dash runs independently.');

    await execute('for (let i = 0; i < 30; i++) gBrowser.addTrustedTab("about:blank", { inBackground: true, skipAnimation: true });');
    await until('return document.getElementById("tabbrowser-arrowscrollbox").hasAttribute("overflowing");');
    const pseudo = 'return getComputedStyle(document.getElementById("tabbrowser-arrowscrollbox-periphery"), "::after").content;';
    assert.equal(await execute(pseudo), 'none');
    await execute('Services.prefs.setBoolPref("sidebar.verticalTabs", false);');
    await until('return !gBrowser.tabContainer.verticalMode;');
    assert.equal(await execute(pseudo), 'none');
    console.log('PASS: the drag area is scoped to a vertical tab strip with room below New Tab.');
  } finally {
    socket?.destroy();
    if (firefox.exitCode === null) firefox.kill();
    fs.closeSync(log);
    console.log('Disposable profile:', profile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
