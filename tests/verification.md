# Verification

Completed locally on Windows on 30 October 2026. The measured browser checks are retained in `browser-report.json`; screenshots are produced under `output/playwright/`.

## Passed

- Logo completion precedes automatic song playback when browser audio policy permits it.
- Real sampled audio output was measured, along with silence after a manual takeover's held notes were released. Keys and the dark staff follow the current musical position.
- User chords pause the song, freeze its position, sound independently and appear as manual score notes.
- The actual browser idle timer resumed playback **15,008ms** after the final test key release. A later note reset the deadline. The resumed musical position continued from the paused position. It did not restart the tune or briefly move the score backwards.
- Unit tests verify that held chords prevent takeover, every release/new note resets the deadline appropriately, explicit stop/suspension/destruction cancel the timer, and the transport's scheduling headroom cannot move the displayed position backwards.
- Mute/unmute was checked against audio output. Explicit Pause cancels automatic resumption. Keyboard shortcuts, focused-key Enter activation, sharp notes, dialog shortcut suppression and Escape close passed.
- Desktop and 320px, 375px, 390px and 768px layouts passed overflow and key-count checks. The staff background is `rgb(27, 17, 43)`. Two simultaneous CDP-emulated touch points played a chord and released cleanly.
- axe detected zero accessibility violations on desktop and at 390px. The mobile help icon received an explicit accessible name after testing found that hiding its text removed its name.
- Reduced motion skips the video and still releases the piano. A native Chrome first-visit audio restriction showed Enable sound; pressing it started the song.
- Normal Chrome page use produced no uncaught page errors. JavaScript syntax checks and all four Node unit tests passed.
- Firefox playback and manual takeover passed.

## Browser limitations

Playwright's Windows WebKit runner exposes neither `AudioContext` nor `webkitAudioContext`, and its video playback stalled on this environment. The site now falls back to the static open logo, reports unavailable sound and still renders manually played notes. That fallback passed. Full audio/video playback on physical Safari/iOS devices remains unverified; this test is not an Apple Safari result.

Touch checks used browser emulation rather than a physical phone. The logo remains the previously delivered 2.5D prototype. The staff is an educational pitch guide and the song is the existing simplified music-box arrangement.

An incidental Chrome layout-shift observation was approximately 0.000203. No production Core Web Vitals claim is made. Browser media restrictions still determine whether sound can start before the first user gesture.
