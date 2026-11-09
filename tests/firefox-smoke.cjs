const fs = require('node:fs');
const http = require('node:http');
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
  fs.copyFileSync(path.join(project, 'firefox/addons-page/userContent.css'), path.join(chrome, 'userContent.css'));
  const port = await availablePort();
  fs.writeFileSync(path.join(profile, 'user.js'), [
    fs.readFileSync(path.join(drag, 'user.js'), 'utf8').trimEnd(),
    `user_pref("marionette.port", ${port});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("sidebar.verticalTabs", true);',
    'user_pref("browser.tabs.warnOnClose", false);',
    'user_pref("extensions.ui.lastCategory", "addons://list/extension");',
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
  let loadServer;
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
    const clickAt = (point, button = 0) => pointer([
      { type: 'pointerMove', origin: 'viewport', ...point },
      { type: 'pointerDown', button },
      { type: 'pointerUp', button },
    ]);
    const tabSelector = name => '[data-test-tab="' + name + '"]';
    const closeSelector = name => tabSelector(name) + ' .tab-close-button';
    const icon = name => execute(
      'return getComputedStyle(document.querySelector(arguments[0])).listStyleImage;', [closeSelector(name)],
    );
    const titleOpacity = name => execute(
      'return getComputedStyle(document.querySelector(arguments[0])).opacity;',
      [tabSelector(name) + ' .tab-label'],
    );
    const faviconFilter = 'getComputedStyle(document.querySelector(arguments[0] + " .tab-icon-image")).filter';
    const readFilter = name => execute(`return ${faviconFilter};`, [tabSelector(name)]);
    async function hover(name, busy = false) {
      const selector = tabSelector(name);
      await until(`
        const tab = document.querySelector(arguments[0]);
        return tab.getBoundingClientRect().height > 0 && tab.hasAttribute('busy') === arguments[1];
      `, [selector, busy]);
      await pointer([{ type: 'pointerMove', origin: 'viewport', ...await center(selector) }]);
      await until('return document.querySelector(arguments[0]).matches(":hover");', [selector]);
    }

    async function openEmptyTab() {
      const before = await execute('return gBrowser.tabs.length;');
      await clickAt(await center('#tabs-newtab-button'));
      await until('return gBrowser.tabs.length === arguments[0] + 1 && gBrowser.selectedTab.isEmpty;', [before]);
      await execute('gBrowser.selectedTab.setAttribute("data-test-tab", "empty-new-tab");');
    }
    const emptyTab = tabSelector('empty-new-tab');
    const waitForEmptyTabClose = () => until('return !document.querySelector(arguments[0]);', [emptyTab]);
    await openEmptyTab();
    await hover('empty-new-tab');
    assert.match(await icon('empty-new-tab'), /close-12/);
    await clickAt(await center(closeSelector('empty-new-tab')));
    await waitForEmptyTabClose();
    await openEmptyTab();
    await clickAt(await center(emptyTab), 1);
    await waitForEmptyTabClose();
    console.log('PASS: New Tab opens with one click and closes with either the hover × or one middle-click.');

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
    for (const name of ['pinned', 'internal', 'restored']) {
      await hover(name);
      assert.match(await icon(name), /close-12/);
    }
    await hover('loaded');
    assert.match(await icon('loaded'), /minus\.svg/);
    assert.equal(await titleOpacity('loaded'), '1');
    assert.equal(await titleOpacity('restored'), '0.65');
    assert.equal(await readFilter('loaded'), 'none');
    assert.equal(await readFilter('restored'), 'grayscale(1)');
    await clickAt(await center(closeSelector('loaded')));
    await until('return document.querySelector(arguments[0])?.hasAttribute("pending");', [tabSelector('loaded')]);
    assert.match(await icon('loaded'), /close-12/);
    assert.equal(await titleOpacity('loaded'), '0.65');
    await until(`return ${faviconFilter}.startsWith("grayscale(1)");`, [tabSelector('loaded')]);
    await execute('gBrowser.selectedTab = document.querySelector(arguments[0]);', [tabSelector('restored')]);
    await hover('restored');
    await until('return document.querySelector(arguments[0]).hasAttribute("data-native-tab-minus");', [closeSelector('restored')]);
    assert.equal(await titleOpacity('restored'), '1');
    assert.equal(await readFilter('restored'), 'none');
    console.log('PASS: unloaded tabs dim their titles and use grayscale favicons until they reload.');

    loadServer = http.createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.write('<title>Loading tab</title><p>Still loading');
    });
    await new Promise(resolve => loadServer.listen(0, '127.0.0.1', resolve));
    const slowPage = 'http://127.0.0.1:' + loadServer.address().port + '/slow';
    const openSlowTab = name => execute(`
      const tab = gBrowser.addTrustedTab(arguments[0], { inBackground: true });
      tab.setAttribute('data-test-tab', arguments[1]);
    `, [slowPage, name]);
    const waitForPending = name =>
      until('return document.querySelector(arguments[0])?.hasAttribute("pending");', [tabSelector(name)]);
    await openSlowTab('loading');
    await hover('loading', true);
    assert.match(await icon('loading'), /minus\.svg/);
    await clickAt(await center(closeSelector('loading')));
    await waitForPending('loading');
    console.log('PASS: the hover dash unloads a tab while its page is loading.');

    await openSlowTab('middle-loading');
    await hover('middle-loading', true);
    await clickAt(await center(tabSelector('middle-loading')), 1);
    await waitForPending('middle-loading');
    await clickAt(await center(tabSelector('restored')), 1);
    await waitForPending('restored');
    await clickAt(await center(tabSelector('pinned')), 1);
    await waitForPending('pinned');
    await clickAt(await center(tabSelector('internal')), 1);
    assert.equal(await execute('return !document.querySelector(arguments[0])?.closing;', [tabSelector('internal')]), true);
    await clickAt(await center(tabSelector('restored')), 1);
    await until('return !document.querySelector(arguments[0]);', [tabSelector('restored')]);
    console.log('PASS: middle-click unloads loading, loaded, and pinned tabs, then closes an unloaded tab.');

    const toolRules = await until(`
      const root = document.querySelector('sidebar-main')?.shadowRoot;
      const style = root?.getElementById('vertical-sidebar-tools-drag');
      return style?.sheet?.cssRules[0] ? Array.from(style.sheet.cssRules[0].cssRules, rule => rule.cssText) : null;
    `);
    assert.match(toolRules[0], /\.buttons-wrapper.*-moz-window-dragging: drag/);
    assert.match(toolRules[1], /moz-button.*-moz-window-dragging: no-drag/);
    const settingsPoint = await until(`
      const root = document.querySelector('sidebar-main')?.shadowRoot;
      const button = root?.querySelector('moz-button[view="viewCustomizeSidebar"]');
      const rect = button?.getBoundingClientRect();
      return rect?.width && rect.height ? {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
      } : null;
    `);
    await clickAt(settingsPoint);
    await until('return SidebarController.isOpen && SidebarController.currentID === "viewCustomizeSidebar";');
    await execute('SidebarController.hide();');
    console.log('PASS: the tools strip has its drag rule and the Settings button still opens.');

    await execute('for (let i = 0; i < 30; i++) gBrowser.addTrustedTab("about:blank", { inBackground: true, skipAnimation: true });');
    await until('return document.getElementById("tabbrowser-arrowscrollbox").hasAttribute("overflowing");');
    const pseudo = 'return getComputedStyle(document.getElementById("tabbrowser-arrowscrollbox-periphery"), "::after").content;';
    assert.equal(await execute(pseudo), 'none');
    await execute('Services.prefs.setBoolPref("sidebar.verticalTabs", false);');
    await until('return !gBrowser.tabContainer.verticalMode;');
    assert.equal(await execute(pseudo), 'none');
    console.log('PASS: the drag area is scoped to a vertical tab strip with room below New Tab.');

    const label = 'return getComputedStyle(document.getElementById("main"), "::before").content;';
    await context('content');
    await send('WebDriver:Navigate', { url: 'about:addons' });
    await until('return !!document.querySelector("#main addon-list[type=extension]");');
    assert.match(await execute(label), /Vertical Tab Tweaks.*Local Firefox customization/);
    const mockPage = '<main id="main"><addon-list type="extension"></addon-list></main>';
    await send('WebDriver:Navigate', { url: 'data:text/html,' + encodeURIComponent(mockPage) });
    assert.equal(await execute(label), 'none');
    console.log('PASS: the local tracking label appears in the Add-ons Manager and stays off regular pages.');
  } finally {
    loadServer?.close();
    loadServer?.closeAllConnections();
    socket?.destroy();
    if (firefox.exitCode === null) firefox.kill();
    fs.closeSync(log);
    console.log('Disposable profile:', profile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
