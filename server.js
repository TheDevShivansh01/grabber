const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const W = 50, H = 50, N = W * H, TICK = 125;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const EMOJI = ['🥔', '🐸', '🍕', '🦆', '🐙', '🍩', '🥦', '🦖', '🧀', '🐧'];
const BOTS = ['Sir Bumblebutt', 'Captain Noodle', 'Lady Waffles', 'Dr. Pickle', 'Big Sploot'];
const found = [path.join(__dirname, 'index.html'), path.join(__dirname, 'public', 'index.html')].find(f => fs.existsSync(f));
if (!found) console.error('index.html not found. Upload index.html next to server.js.');
const html = found ? fs.readFileSync(found) : Buffer.from('<h1>index.html is missing</h1><p>Upload <b>index.html</b> next to server.js in your GitHub repo and redeploy.</p>');
const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
const wss = new WebSocketServer({ server });
const rooms = new Map();
const rnd = n => Math.floor(Math.random() * n);

class Room {
  constructor(code, pub, max, bots) {
    Object.assign(this, { code, pub, max, nb: bots, players: [], owner: new Uint8Array(N), trail: new Uint8Array(N), feed: [], t: 0 });
    for (let i = 0; i < bots; i++) this.add(null, BOTS[i]);
    this.timer = setInterval(() => this.tick(), TICK);
  }
  humans() { return this.players.filter(p => p.ws).length; }
  add(ws, name) {
    let id = 1; while (this.players.some(p => p.id === id)) id++;
    const p = { id, ws, name: (name || 'Goober').slice(0, 14), e: EMOJI[id - 1], x: 0, y: 0, d: 0, nd: null, q: [], alive: false, tr: [], respawn: 0, bot: !ws, phase: 'out', lim: 8 };
    this.players.push(p); this.spawn(p); return p;
  }
  spawn(p) {
    let x, y, ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      x = 3 + rnd(W - 6); y = 3 + rnd(H - 6); ok = true;
      for (let a = -3; a <= 3 && ok; a++) for (let b = -3; b <= 3; b++) if (this.owner[(y + b) * W + x + a] || this.trail[(y + b) * W + x + a]) { ok = false; break; }
    }
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) this.owner[(y + b) * W + x + a] = p.id;
    Object.assign(p, { x, y, d: rnd(4), nd: null, q: [], alive: true, tr: [], hx: x, hy: y, phase: 'out', lim: 6 + rnd(8) });
  }
  kill(p, by, why) {
    if (!p.alive) return;
    p.alive = false; p.respawn = 16;
    for (let i = 0; i < N; i++) { if (this.owner[i] === p.id) this.owner[i] = 0; if (this.trail[i] === p.id) this.trail[i] = 0; }
    p.tr = [];
    if (why === 'quit') return;
    const m = by && by !== p ? [`${by.name} squished ${p.name} like a grape 🍇`, `${p.name} got booped by ${by.name} 💥`, `${by.name} chomped ${p.name}'s tail 🐊`][rnd(3)]
      : why === 'wall' ? `${p.name} kissed the wall 💋` : `${p.name} tripped on their own tail 🤦`;
    this.feed.push(m);
  }
  safe(p, d) {
    const x = p.x + DX[d], y = p.y + DY[d];
    return x >= 0 && y >= 0 && x < W && y < H && this.trail[y * W + x] !== p.id;
  }
  think(p) {
    const here = this.owner[p.y * W + p.x] === p.id;
    if (here && !p.tr.length) { p.phase = 'out'; if (Math.random() < 0.3) p.lim = 6 + rnd(9); }
    if (p.tr.length >= p.lim) p.phase = 'home';
    const opts = [0, 1, 2, 3].filter(d => (d + 2) % 4 !== p.d && this.safe(p, d));
    if (!opts.length) return;
    let pick = opts.includes(p.d) ? p.d : opts[rnd(opts.length)];
    if (p.phase === 'home') {
      const dist = d => Math.abs(p.x + DX[d] - p.hx) + Math.abs(p.y + DY[d] - p.hy);
      pick = opts.sort((a, b) => dist(a) - dist(b))[0];
    } else if (Math.random() < 0.18) pick = opts[rnd(opts.length)];
    p.nd = pick;
  }
  fill(p) {
    const o = this.owner, tr = this.trail;
    for (const i of p.tr) { o[i] = p.id; tr[i] = 0; }
    p.tr = [];
    const seen = new Uint8Array(N), q = [];
    const push = i => { if (!seen[i] && o[i] !== p.id) { seen[i] = 1; q.push(i); } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i / W) | 0;
      if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
    }
    for (let i = 0; i < N; i++) if (!seen[i] && o[i] !== p.id) {
      o[i] = p.id;
      const v = this.players.find(z => z.id === tr[i]); if (v && v !== p) this.kill(v, p);
      tr[i] = 0;
    }
  }
  tick() {
    this.t++;
    for (const p of this.players) {
      if (!p.alive) { if (--p.respawn <= 0) this.spawn(p); continue; }
      if (p.bot) this.think(p);
      if (p.bot) { if (p.nd !== null && (p.nd + 2) % 4 !== p.d) p.d = p.nd; }
      else while (p.q.length) { const d = p.q.shift(); if (d !== p.d && (d + 2) % 4 !== p.d) { p.d = d; break; } }
      const x = p.x + DX[p.d], y = p.y + DY[p.d];
      if (x < 0 || y < 0 || x >= W || y >= H) { this.kill(p, null, 'wall'); continue; }
      const i = y * W + x, tv = this.trail[i];
      if (tv) {
        const v = this.players.find(z => z.id === tv);
        if (v === p) { this.kill(p, null, 'self'); continue; }
        if (v) this.kill(v, p);
      }
      p.x = x; p.y = y;
      if (this.owner[i] === p.id) { if (p.tr.length) this.fill(p); }
      else { this.trail[i] = p.id; p.tr.push(i); }
    }
    const counts = {}, buf = Buffer.alloc(N * 2);
    for (let i = 0; i < N; i++) { buf[i] = this.owner[i]; buf[N + i] = this.trail[i]; if (this.owner[i]) counts[this.owner[i]] = (counts[this.owner[i]] || 0) + 1; }
    const msg = JSON.stringify({
      t: 's', g: buf.toString('base64'), f: this.feed.splice(0),
      p: this.players.map(p => ({ i: p.id, n: p.name, e: p.e, x: p.x, y: p.y, d: p.d, a: p.alive ? 1 : 0, s: +((counts[p.id] || 0) * 100 / N).toFixed(1), b: p.bot ? 1 : 0 }))
    });
    for (const p of this.players) if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
  }
  remove(p) {
    this.kill(p, null, 'quit');
    this.players = this.players.filter(z => z !== p);
    if (!this.humans()) { clearInterval(this.timer); rooms.delete(this.code); }
  }
}

const RACE_MS = 45000;
class RaceRoom {
  constructor(code, pub, max, bots) {
    Object.assign(this, { code, pub, max, nb: bots, race: true, players: [], ph: 'count', until: Date.now() + 6000, seed: rnd(1e9) });
    for (let i = 0; i < bots; i++) this.add(null, BOTS[i]);
    this.timer = setInterval(() => this.tick(), 100);
  }
  humans() { return this.players.filter(p => p.ws).length; }
  add(ws, name) {
    let id = 1; while (this.players.some(p => p.id === id)) id++;
    const p = { id, ws, name: (name || 'Goober').slice(0, 14), e: EMOJI[id - 1], x: 0, d: 0, v: 0, c: 0, bot: !ws, w: this.ph === 'run' ? 1 : 0, tx: 0, st: 0, jt: 0, j: 0, tv: 12, lp: Date.now() };
    this.players.push(p); this.lanes(); return p;
  }
  lanes() { const n = this.players.length; if (this.ph === 'count') this.players.forEach((p, i) => { p.x = n < 2 ? 0 : -0.6 + i * 1.2 / (n - 1); }); }
  newRound(n) {
    Object.assign(this, { ph: 'count', until: n + 5000, seed: rnd(1e9) });
    for (const p of this.players) Object.assign(p, { d: 0, v: 0, c: 0, w: 0, st: 0 });
    this.lanes();
  }
  tick() {
    const n = Date.now();
    if (n >= this.until) {
      if (this.ph === 'count') { this.ph = 'run'; this.until = n + RACE_MS; for (const p of this.players) p.lp = n; }
      else if (this.ph === 'run') { this.ph = 'result'; this.until = n + 7000; }
      else this.newRound(n);
    }
    if (this.ph === 'run') for (const p of this.players) if (p.bot) {
      if (n < p.st) p.v += (4 - p.v) * 0.3;
      else { p.v += (p.tv - p.v) * 0.15; if (Math.random() < 0.012) p.st = n + 700; }
      if (Math.random() < 0.08) p.tx = Math.random() * 1.7 - 0.85;
      if (Math.random() < 0.03) p.tv = 10.5 + Math.random() * 3.5;
      if (Math.random() < 0.008) p.jt = n + 1000;
      p.x += (p.tx - p.x) * 0.12; p.d += p.v * 0.1 * (n < p.jt ? 1.2 : 1); p.c = n < p.st ? 1 : 0; p.j = n < p.jt ? 1 : 0;
    }
    const msg = JSON.stringify({ t: 'r', ph: this.ph, tl: this.until - n, seed: this.seed,
      p: this.players.map(p => ({ i: p.id, n: p.name, e: p.e, x: +p.x.toFixed(3), d: +p.d.toFixed(1), b: p.bot ? 1 : 0, w: p.w, c: p.c, j: p.j })) });
    for (const p of this.players) if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
  }
  pos(p, m) {
    if (this.ph !== 'run' || p.w) return;
    const n = Date.now(), cap = (n - p.lp) / 1000 * 24 + 1; p.lp = n;
    p.x = Math.max(-1, Math.min(1, +m.x || 0));
    p.d = Math.min(Math.max(p.d, +m.d || 0), p.d + cap); p.c = m.c ? 1 : 0; p.j = m.j ? 1 : 0;
  }
  remove(p) {
    this.players = this.players.filter(z => z !== p);
    if (!this.humans()) { clearInterval(this.timer); rooms.delete(this.code); }
  }
}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c; do { c = Array.from({ length: 4 }, () => A[rnd(A.length)]).join(''); } while (rooms.has(c));
  return c;
}
function enter(ws, room, name) {
  if (room.humans() >= room.max - room.players.filter(p => p.bot).length) return ws.send(JSON.stringify({ t: 'err', m: 'That room is full (max players reached).' }));
  const p = room.add(ws, name);
  ws.room = room; ws.me = p;
  ws.send(JSON.stringify({ t: 'joined', code: room.code, id: p.id, W, H, pub: room.pub, max: room.max, mode: room.race ? 'race' : 'grab' }));
}

wss.on('connection', ws => {
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'pos') { if (ws.room && ws.room.race && ws.me) ws.room.pos(ws.me, m); return; }
    if (m.t === 'dir') { const me = ws.me; if (me && me.q && m.d >= 0 && m.d < 4) { const last = me.q.length ? me.q[me.q.length - 1] : me.d; if (m.d !== last && me.q.length < 3) me.q.push(m.d); } return; }
    if (ws.room) return;
    if (m.t === 'public') {
      const race = m.mode === 'race';
      let r = [...rooms.values()].find(r => r.pub && !!r.race === race && r.humans() < r.max - r.nb);
      if (!r) { r = race ? new RaceRoom(newCode(), true, 5, 2) : new Room(newCode(), true, 9, 3); rooms.set(r.code, r); }
      enter(ws, r, m.name);
    } else if (m.t === 'create') {
      const race = m.mode === 'race', top = race ? 5 : 9, bt = race ? 2 : 3;
      const max = Math.min(top, Math.max(2, m.max | 0 || 4)), bots = Math.min(bt, Math.max(0, m.bots | 0), max - 1);
      const r = race ? new RaceRoom(newCode(), false, max, bots) : new Room(newCode(), false, max, bots); rooms.set(r.code, r);
      enter(ws, r, m.name);
    } else if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return ws.send(JSON.stringify({ t: 'err', m: 'No room with that code. Check the letters!' }));
      enter(ws, r, m.name);
    }
  });
  ws.on('close', () => { if (ws.room && ws.me) ws.room.remove(ws.me); });
});
server.listen(process.env.PORT || 3000, () => console.log('Goober Grab running on port', process.env.PORT || 3000));
