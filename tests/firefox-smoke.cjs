const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const project = path.resolve(__dirname, '..');
const profileRoot = path.join(project, '.test-profiles');
fs.mkdirSync(profileRoot, { recursive: true });
const profile = fs.mkdtempSync(path.join(profileRoot, 'firefox-'));
const packagePath = path.resolve(process.argv[2] || path.join(project, 'dist/zendo-grip-2.0.0.zip'));

async function availablePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function main() {
  const port = await availablePort();
  fs.writeFileSync(path.join(profile, 'user.js'), [
    `user_pref("marionette.port", ${port});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");'
  ].join('\n'));
  const appData = path.join(profile, 'appdata');
  const localData = path.join(profile, 'localdata');
  fs.mkdirSync(appData);
  fs.mkdirSync(localData);
  const log = fs.openSync(path.join(profile, 'process.log'), 'a');
  const firefox = spawn('C:\\Program Files\\Mozilla Firefox\\firefox.exe',
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
    const asyncExecute = async (script, args = []) => (await send('WebDriver:ExecuteAsyncScript', { script, args, sandbox: null, newSandbox: true, scriptTimeout: 20000 })).value;
    const elementID = value => value['element-6066-11e4-a52e-4f735466cecf'];
    const find = async selector => (await send('WebDriver:FindElement', { using: 'css selector', value: selector })).value;
    const click = async selector => send('WebDriver:ElementClick', { id: elementID(await find(selector)) });
    console.log('Session', JSON.stringify(await send('WebDriver:NewSession', { capabilities: { acceptInsecureCerts: false, pageLoadStrategy: 'eager' } })));
    await send('WebDriver:SetTimeouts', { pageLoad: 20000, script: 20000, implicit: 2000 });
    const addonId = (await send('Addon:Install', { path: packagePath, temporary: true })).value;
    console.log('Installed test package', addonId);
    await context('chrome');

    await execute('Services.prefs.setBoolPref("sidebar.verticalTabs", true);');
    await send('WebDriver:SetWindowRect', { x: 120, y: 120, width: 1000, height: 650 });
    const info = await execute(`
      const policy = WebExtensionPolicy.getByID(arguments[0]);
      return {
        name: policy.extension.name,
        panel: policy.getURL('sidebar.html'),
        sidebarId: Array.from(SidebarController.sidebars.keys()).find(id => id.includes('c18776a4')),
        autoOpened: SidebarController.isOpen && SidebarController.currentID?.includes('c18776a4'),
      };
    `, [addonId]);
    assert.equal(info.name, 'Zendo Grip');
    assert.ok(info.sidebarId);
    assert.equal(info.autoOpened, false);

    const openedPanel = await asyncExecute(`
      const [id, done] = arguments;
      (async () => {
        await SidebarController.show(id);
        for (let tries = 0; tries < 50; tries++) {
          const panel = document.getElementById('sidebar')?.contentDocument?.getElementById('webext-panels-browser');
          if (panel?.currentURI?.scheme === 'moz-extension') return panel.currentURI.spec;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw Error('Could not find the mounted sidebar panel');
      })().then(done, error => done(String(error)));
    `, [info.sidebarId]);
    assert.equal(openedPanel, info.panel);
    assert.equal(await execute('return gBrowser.tabContainer.verticalMode;'), true);
    console.log('PASS: Zendo Grip opens from the sidebar tools alongside Firefox vertical tabs.');

    const rect = 'return { left: window.screenX, top: window.screenY, width: window.outerWidth, height: window.outerHeight };';
    const pointer = actions => send('WebDriver:PerformActions', {
      actions: [{ type: 'pointer', id: 'grip-mouse', parameters: { pointerType: 'mouse' }, actions }],
    });
    for (const edge of ['top', 'middle', 'bottom']) {
      const point = await execute(`
        const sidebar = document.getElementById('sidebar');
        const outer = sidebar.getBoundingClientRect();
        const inner = sidebar.contentDocument.getElementById('webext-panels-browser').getBoundingClientRect();
        const y = { top: 20, middle: inner.height / 2, bottom: inner.height - 13 }[arguments[0]];
        return { x: Math.round(outer.x + inner.x + 35), y: Math.round(outer.y + inner.y + y) };
      `, [edge]);
      const before = await execute(rect);
      await pointer([
        { type: 'pointerMove', origin: 'viewport', ...point },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', origin: 'viewport', x: point.x + 26, y: point.y - 14, duration: 100 },
        { type: 'pointerUp', button: 0 },
      ]);
      let after;
      for (let i = 0; i < 50; i++) {
        after = await execute(rect);
        if (after.left > before.left && after.top < before.top) break;
        await sleep(100);
      }
      assert.ok(after.left > before.left && after.top < before.top, 'Dragging the ' + edge + ' should move the window');
      assert.equal(after.width, before.width);
      assert.equal(after.height, before.height);
      console.log('PASS: dragging the ' + edge + ' of the sidebar moved the Firefox window.');
    }
  } finally {
    socket?.destroy();
    if (firefox.exitCode === null) firefox.kill();
    fs.closeSync(log);
    console.log('Disposable profile:', profile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
