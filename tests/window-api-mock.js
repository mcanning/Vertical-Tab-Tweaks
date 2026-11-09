const windowInfo = { id: 7, left: 100, top: 110, state: 'normal' };
const moves = [];

globalThis.testWindow = {
  moves,
  ready: false,
  maximize() { windowInfo.state = 'maximized'; },
};

globalThis.browser = {
  windows: {
    async getCurrent() {
      testWindow.ready = true;
      return { ...windowInfo };
    },
    async get(id) {
      if (id !== windowInfo.id) throw Error('Wrong window');
      return { ...windowInfo };
    },
    async update(id, bounds) {
      if (id !== windowInfo.id) throw Error('Wrong window');
      await new Promise(resolve => setTimeout(resolve, 25));
      Object.assign(windowInfo, bounds);
      moves.push(bounds);
      return { ...windowInfo };
    },
  },
};
