Electron packaging — Unit Co-Pilot

This file documents how to build and test the Electron app on your machine.

Prerequisites
- Node.js and npm
- For Windows builds: electron-builder requires a build environment; on Windows this is typically available by default. For code signing you need certificates.

Dev run (local dev server + Electron):
```powershell
# build the web assets then start electron against them
npm run build
npm run electron:dev
```

Production build (Windows installer using electron-builder):
```powershell
# generate the web build first
npm run build
# create an installer for Windows (nsis)
npm run electron:build
```

Notes
- `icons/icon.ico` must exist (use `npm run generate:icons` to create it).
- The build uses the `build` block in `package.json` (appId, productName, files, win.icon).
- If the build fails with native dependency errors, try removing or adjusting native devDeps before packaging, or use a CI runner configured for Windows builds.

Debugging
- When electron crashes or fails to load the UI, check `electron/main.js` which loads `dist/index.html` when packaged, otherwise loads `http://localhost:5173` during development.
- Use the DevTools in dev mode by uncommenting `mainWindow.webContents.openDevTools();` in `electron/main.js`.
