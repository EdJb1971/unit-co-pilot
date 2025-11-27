Unit Co-Pilot — Android packaging (Capacitor)

This project can be packaged into an Android APK using Capacitor. These steps scaffold the Android project and open it in Android Studio for building and signing.

Prerequisites
- Node.js and npm installed
- Java JDK (11+) and Android SDK
- Android Studio installed for building/signing the APK

Quick steps
1. Install Capacitor CLI and Core (if not already installed):
   npm install @capacitor/core @capacitor/cli --save

2. Build the web app:
   npm run build

3. Initialize Capacitor (only once) — replace the id and app name if desired:
   npx cap init unit-copilot com.example.unitcopilot

   Note: The project now has `capacitor.config.json` which points to `dist` as the web directory.

4. Add Android platform and copy web assets:
   npx cap add android
   npx cap copy

5. Open Android Studio to build:
   npx cap open android

6. In Android Studio: build a signed APK or AAB (Build > Generate Signed Bundle / APK). Follow the prompts to create a signing key, select build variant (release), and generate the package.

7. Install the generated APK on device or distribute via the Play Store.

Notes
- Do NOT embed your API key in the build. The app prompts for the API key on first run and stores it locally.
- If you make web changes after opening Android Studio, re-run `npm run build` and `npx cap copy` before rebuilding in Android Studio.
- For advanced features (native plugins, permissions), refer to Capacitor docs: https://capacitorjs.com/docs
