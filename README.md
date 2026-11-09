# Tivoo Studio

A web app that controls a **Divoom Tivoo** (16×16 LED Bluetooth speaker) straight from Chrome, with no install needed.

- **Fun:** generated animations (fire, plasma, Matrix rain, starfield, Game of Life, live pixel clock…), uploaded to loop on the speaker or streamed live
- **Picture:** any photo or animated GIF, scaled to 16×16
- **Text:** scrolling text with pixel fonts and rainbow letters
- **Draw:** 16×16 pixel editor that mirrors to the speaker as you draw
- **Controls:** brightness, clock styles, mood light, built-in effects/visualizers, scoreboard, volume

## Use it

1. Pair the Tivoo in your phone's (or PC's) Bluetooth settings.
2. Close the Divoom app, since only one app can hold the connection.
3. Open the GitHub Pages site in **Chrome on Android 138+** or **Chrome/Edge on desktop**, then tap **Connect**.

It talks to the speaker with Web Serial over Bluetooth RFCOMM (Serial Port Profile).

## Protocol

`divoom.js` holds the protocol encoder. It is based on the community reverse-engineering in
[d03n3rfr1tz3/hass-divoom](https://github.com/d03n3rfr1tz3/hass-divoom) and
[RomRider/node-divoom-timebox-evo](https://github.com/RomRider/node-divoom-timebox-evo).

## Develop

It's plain static files with no build step:

```
python -m http.server 8000   # then open http://localhost:8000
```

When releasing a change, bump the `?v=` number on the script imports in `index.html` and `app.js`
and the `CACHE` name in `sw.js`, so phones never mix old and new files.
