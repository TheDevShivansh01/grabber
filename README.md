# 🥔 Goober Grab

Multiplayer territory game (paper.io 2 style) with goofy emoji characters.

- **Play Online**: public lobby, automatically adds 3 funny bots, up to 9 players.
- **Create Room**: choose max players (2–9) and 0–3 bots, get a 4-letter code + share link.
- **Join**: enter a code, or open a shared link like `https://yourgame.com/?room=ABCD`.

## Run locally
```
npm install
npm start      # http://localhost:3000
```

## Deploy free on Render
1. Push this folder to a GitHub repo.
2. render.com → New → **Web Service** → pick the repo.
3. Build command: `npm install`  Start command: `npm start`
4. Open the Render URL and share it. (WebSockets work automatically; works on Railway/Fly/Glitch too.)

Controls: Arrow keys / WASD, or swipe on phone. Leave your territory to draw a tail, come back to claim the area. If someone touches your tail, you're squished!
