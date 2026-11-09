const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const work = __dirname;
const source = path.join(work, '..', 'addon');
const profileRoot = path.join(work, '..', '.test-profiles');
fs.mkdirSync(profileRoot, { recursive: true });
const profile = fs.mkdtempSync(path.join(profileRoot, 'edge-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const files = new Set(['sidebar.html', 'sidebar.js', 'sidebar.css', 'window-drag.js', 'icon.svg']);
const policy = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8')).content_security_policy.extension_pages;

async function main() {
  const server = http.createServer((req, res) => {
    const file = req.url.slice(1);
    if (file === 'mock.js') {
      res.setHeader('Content-Type', types['.js']);
      res.end(fs.readFileSync(path.join(work, 'window-api-mock.js')));
      return;
    }
    if (!files.has(file)) { res.writeHead(404).end(); return; }
    let data = fs.readFileSync(path.join(source, file));
    if (file === 'sidebar.html') data = data.toString().replace('<script type="module"', '<script src="mock.js"></script><script type="module"');
    res.setHeader('Content-Type', types[path.extname(file)]);
    res.setHeader('Content-Security-Policy', policy);
    res.end(data);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(profile, 'edge.log'), 'w');
  const browser = spawn(String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-crash-reporter', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', log, log] });
  let socket;
  try {
    const debugPath = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(debugPath); i++) await pause(100);
    if (!fs.existsSync(debugPath)) throw Error('Edge did not start: ' + fs.readFileSync(path.join(profile, 'edge.log'), 'utf8'));
    const port = fs.readFileSync(debugPath, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const pending = new Map();
    const requests = [];
    const errors = [];
    let serial = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(Error('Timeout: ' + method)); }, 5000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(result.result.description);
      return result.result.value;
    };
    const until = async expression => {
      for (let i = 0; i < 80; i++) {
        const result = await evaluate(expression);
        if (result) return result;
        await pause(50);
      }
      throw Error('Timed out waiting for ' + expression);
    };
    const mouse = (type, x, y, opts = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...opts });
    await send('Network.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 278, height: 430, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/sidebar.html' });
    await until('testWindow.ready');
    assert.equal(await evaluate('document.title'), 'Zendo Grip');
    assert.equal(await evaluate('document.body.hasAttribute("data-window-drag")'), true);
    assert.equal(await evaluate('getComputedStyle(document.body).backgroundImage'), 'none');
    assert.equal(await evaluate('testWindow.moves.length'), 0);
    await mouse('mouseMoved', 72, 310);
    await mouse('mousePressed', 72, 310, { clickCount: 1, button: 'left' });
    await mouse('mouseMoved', 74, 311, { buttons: 1 });
    assert.equal(await evaluate('testWindow.moves.length'), 0);
    await mouse('mouseMoved', 105, 330, { buttons: 1 });
    await mouse('mouseMoved', 150, 350, { buttons: 1 });
    await mouse('mouseReleased', 150, 350, { clickCount: 1, button: 'left' });
    await until('testWindow.moves.at(-1)?.left === 178');
    assert.deepEqual(await evaluate('testWindow.moves.at(-1)'), { left: 178, top: 150 });
    assert.equal(await evaluate('document.documentElement.hasAttribute("data-window-dragging")'), false);
    const footer = await evaluate(`(() => {
      const rect = document.querySelector('.window-drag-footer').getBoundingClientRect();
      return { bottom: rect.bottom, y: Math.round(rect.top + rect.height / 2) };
    })()`);
    assert.equal(footer.bottom, 430);
    await mouse('mouseMoved', 72, footer.y);
    await mouse('mousePressed', 72, footer.y, { clickCount: 1, button: 'left' });
    await mouse('mouseMoved', 118, footer.y - 24, { buttons: 1 });
    await mouse('mouseReleased', 118, footer.y - 24, { clickCount: 1, button: 'left' });
    await until('testWindow.moves.at(-1)?.left === 224');
    assert.deepEqual(await evaluate('testWindow.moves.at(-1)'), { left: 224, top: 126 });
    const moveCount = await evaluate('testWindow.moves.length');
    await evaluate('testWindow.maximize()');
    await mouse('mouseMoved', 89, 22);
    await mouse('mousePressed', 89, 22, { clickCount: 1, button: 'left' });
    await mouse('mouseMoved', 125, 43, { buttons: 1 });
    await mouse('mouseReleased', 125, 43, { clickCount: 1, button: 'left' });
    await until('document.querySelector("#status").textContent.includes("Restore the Firefox window")');
    assert.equal(await evaluate('testWindow.moves.length'), moveCount);
    assert.ok(requests.every(url => url.startsWith('http://127.0.0.1:')));
    assert.deepEqual(errors, []);
    console.log('PASS: drag threshold, main and footer drag surfaces, and maximized-window guard. Window APIs mocked.');
    await send('Browser.close').catch(() => {});
  } finally {
    socket?.close();
    if (browser.exitCode === null) browser.kill();
    fs.closeSync(log);
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
