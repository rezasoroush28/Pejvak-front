# Pejvak website

A modular music website combining the existing Pejvak logo animation and the Little Piano instrument. Built with HTML, CSS and browser ES modules, with no framework or runtime UI dependencies.

## GitHub Pages

MVP address once Pages is enabled: **https://rezasoroush28.github.io/Pejvak-front/**.

The workflow in `.github/workflows/pages.yml` runs syntax checks and playback-timing tests on pushes to `main`, then deploys only `dist/`. On GitHub Free, Pages requires this repository to be public; while private, the deployment job is skipped and the checks still run. Configure the Pages source as **GitHub Actions** in repository settings. `workflow_dispatch` also allows a manual deployment.

All runtime asset and module URLs are relative to the page or module, so the website works under the `/Pejvak-front/` project path as well as on a future custom domain. No separate build or repository secrets are required. Fonts, piano samples, MIDI and animation assets are hosted with the site.

A custom domain is optional. To attach an owned subdomain later, add it under repository Settings → Pages, then point its DNS `CNAME` to `rezasoroush28.github.io`. The custom Actions deployment does not require a `CNAME` file. Keep HTTPS enabled once GitHub has provisioned its certificate.

## Run

```powershell
npm run dev
```

Open `http://127.0.0.1:5175/`. Serving the site needs only Node.js; installation is needed for development tests, not for the website. Deployment serves `dist/` as static files.

## The experience

1. The supplied P-to-piano logo animation plays above the instrument on each page visit.
2. Its completion event starts the mini piano's song. If the browser blocks first-visit audio, the instrument shows **Enable sound**. A tap on that button unlocks audio and continues the sequence. Enabling sound during the intro prepares audio without starting the song early.
3. A piano key immediately pauses the scheduled song, preserves its position, sounds the user's note, and switches the dark-purple staff to the user's live notation. Chords, sharp notes, touch, mouse, keyboard shortcuts, and focused keys with Enter/Space are supported.
4. After the last key is released, 15 seconds without another piano note resumes the song at its saved position. Every new note resets the deadline; held keys prevent automatic takeover. The countdown is shown beside the playing hint.
5. Explicit Pause cancels automatic resumption. Resume and Restart are available. Sound can be muted separately without stopping the musical clock. Backgrounding the page or opening a dialog pauses the instrument. A song that was playing resumes on return; a user turn receives a fresh idle countdown.

The song is the same simplified, transposed Victor's Piano Solo music-box arrangement used in the lab. The score follows actual pitches; the 13-key C4–C5 piano highlights corresponding pitch classes when the arrangement uses other octaves. The notation is an educational live pitch guide. It does not provide a complete engraved piano score.

The logo reuses the existing rendered 2.5D prototype, including its previously documented registration blends. This website does not revise or claim a new 3D reconstruction. Reduced motion and detectable Data Saver show the final logo artwork and proceed without downloading the video. A stalled video also falls back to the open still after eight foreground seconds, so it cannot hold up the instrument indefinitely. The instrument remains usable during the intro.

## Add a plugin

Each page module is registered in `dist/site.config.js`:

```js
export const plugins = [
  {
    id: 'piano',
    slot: '[data-plugin-slot="piano"]',
    module: './plugins/piano/plugin.js',
    options: { idleResumeMs: 15000 },
  },
  {
    id: 'logo',
    slot: '[data-plugin-slot="logo"]',
    module: './plugins/logo/plugin.js',
    options: { playOncePerSession: false },
  },
];
```

To add a future module, place its files under `dist/plugins/`, add a container in `index.html`, include any stylesheet, then add its definition to this array. Module URLs resolve relative to `plugin-host.js`.

Every plugin exports:

```js
export function mount(container, { bus, emit, options }) {
  // Own only this container's content. Listen through bus.addEventListener().
  // Publish a namespaced event with emit('my-plugin:event', { value: 1 }).
  return {
    // Optional public methods used by the page coordinator.
    destroy() {
      // Remove owned DOM, listeners, timers, observers and audio resources.
    },
  };
}
```

The host supports asynchronous module loading, tracks instances, and cleans up in reverse order. It also disposes an instance if the host was destroyed while that module was loading. These are frontend plugins, not browser extensions or external-service connectors. Add one active keyboard-driven instrument at a time; the piano's keyboard shortcuts currently listen on the document.

`app.js` coordinates the two modules through a page-local event bus. Modules never import each other. Their reusable entry points are:

| Module | Events | Public methods |
| --- | --- | --- |
| Logo | `logo:complete` with `played`, `static`, `blocked` or `error` state | `destroy()` |
| Piano | `piano:state`, `piano:note`, `piano:play` | `start()`, `enableSound()`, `toggleSound()`, `pause()`, `suspend(reason, bool)`, `destroy()` |

If the logo is removed from configuration, the coordinator starts the piano directly. A failed logo video falls back to the static open piano and still releases the instrument. Removing the piano leaves the logo independent. UI styles use the piano's `mp-` prefix and the logo's `pejvak-logo` prefix. Shared site colors and type are in `styles.css`; the score's dark paper and ink tokens are local to the piano.

## Files

- `dist/index.html`, `styles.css`: responsive website shell, help and music credits.
- `dist/plugin-host.js`, `site.config.js`, `app.js`: mounting and coordination.
- `dist/plugins/logo/`: reusable logo component, adapter, styles and optimized desktop/mobile video/still artwork.
- `dist/plugins/piano/`: mini piano, sample engine, audio-clock transport, score renderer, keyboard mapping and finite idle timer.
- `dist/assets/`: local piano samples, MIDI arrangement/parser, fonts and notices.
- `server.mjs`: local static server with range requests, MIME types and versioned logo caching.

For a future embedded use of just the instrument, include `piano.css`, call its exported `mount()` with a container/event emitter, and call `start()` when it should become eligible to play. Asset URLs resolve relative to the plugin files. Preserve the directory structure or configure the sample engine's asset base URL.

## Checks

```powershell
npm install
npm test
npm run check
npx playwright install firefox webkit
npm run test:browser
```

The browser suite expects installed Google Chrome and a running local server. It tests the actual 15-second deadline, a later note resetting it, held chords, audio output/silence, mute, score state, paused position, touch and keyboard input, the first-visit browser audio restriction, reduced motion, mobile layouts, and automated accessibility. Results/screenshots are written under `output/playwright/`. See `tests/verification.md` for the completed run and its limits.

## Credits and boundaries

Music: Danny Elfman's Victor's Piano Solo from Corpse Bride, using the simplified music-box arrangement by SinfoniaItaliana linked in the on-page credits. Samples: Salamander Grand Piano by Alexander Holm, CC BY 3.0, via Tone.js Piano. MIDI parser: @tonejs/midi, MIT. DM Sans and Instrument Serif fonts: SIL Open Font License. Preserve the on-page attribution and included license files.

The original instruments lab and standalone logo projects remain separate source projects. This site vendors their reusable assets and adapted modules; it does not automatically overwrite them or pull future changes. All interactions happen in the browser. There is no account system, backend storage, analytics or external-service connection in this version.
