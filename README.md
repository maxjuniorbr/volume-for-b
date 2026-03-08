# Volume for B

Boost Chrome tab audio up to 600%, with per-tab control and local processing in the browser.

**Ad-free. No data collection. Open source.**

Extension page: https://maxjuniorbr.github.io/volume-for-b/

---

## What to Expect

- It helps when a browser tab is too quiet even with browser and system volume already high.
- Control is per tab. It does not change the computer's overall volume.
- Audio processing happens locally in the browser.
- It increases gain. It does not fix poor source audio or replace hardware.

## Core Features

- 0% to 600% volume range
- Per-tab audio control
- Mute, unmute, and quick reset
- Per-domain memory
- Light and dark themes
- Extension UI in Portuguese and English
- Public landing page in EN, PT-BR, and ES

## Stack and Structure

- Chrome Extension Manifest V3
- `popup.*` for the extension UI
- `sw.js` for extension orchestration
- `offscreen.*` for audio processing
- `_locales/` for localization
- `tests/` covering the core flow

## Run Locally

```bash
git clone https://github.com/maxjuniorbr/volume-for-b.git
cd volume-for-b
npm install
npm test
```

After that:

1. Open `chrome://extensions/`
2. Enable developer mode
3. Click `Load unpacked`
4. Select the project folder

## Main Scripts

```bash
npm run dev        # Developer-mode instructions
npm run build      # Production build
npm run lint       # Fix lint issues
npm run lint:check # Validate lint without changing files
npm test           # Run unit tests
npm run clean      # Remove build artifacts
```

## Quality and Validation

- `npm run lint:check`
- `npm test`
- `npm run build`
- SonarCloud with an `A` Quality Gate target

## Project Documents

- Public page: https://maxjuniorbr.github.io/volume-for-b/
- Support: [SUPPORT.md](SUPPORT.md)
- Privacy: [PRIVACY.md](PRIVACY.md)
- Security: [SECURITY.md](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE).
