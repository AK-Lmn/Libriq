# LibriQ Screenshot Capture

This folder contains the automated screenshot workflow for LibriQ project images.

## Run

From the repository root:

```bash
npm install
npm run screenshots
```

## What it does

- Starts a local static server for `frontend/`
- Launches Playwright in a dedicated browser context
- Seeds safe screenshot-only localStorage data
- Captures deterministic PNGs for desktop and mobile layouts
- Saves output to `docs/screenshots/`

## Notes

- The script uses isolated browser storage and does not affect normal app usage.
- Generated screenshots are meant for README/project showcase use.
- If you do not want generated PNGs committed, keep only this workflow file in version control and exclude the images themselves as needed.
