# Build FitLens As An Android APK From Windows

You can turn this app into a real Android APK for your Realme phone from Windows by wrapping the web app with Capacitor.

## Install Once

1. Install Node.js from `https://nodejs.org`
2. Install Android Studio from `https://developer.android.com/studio`
3. Open Android Studio once and install the recommended Android SDK tools.
4. On your Realme phone:
   - Open **Settings > About device**
   - Tap **Version** or **Build number** 7 times to enable Developer Options
   - Open **Developer Options**
   - Turn on **USB debugging**

## Create The Android App Wrapper

Open PowerShell in the `BodyMeasureWebMVP` folder and run:

```powershell
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init FitLens com.nupurlabs.fitlens --web-dir .
npx cap add android
npx cap sync android
npx cap open android
```

Android Studio will open the generated Android project.

## Run On Realme Phone

1. Connect your Realme phone with USB.
2. Allow USB debugging on the phone.
3. In Android Studio, select your phone as the target device.
4. Press **Run**.

This installs FitLens as a real Android app on your phone.

## Important

The app uses MediaPipe from a CDN, so the first version needs internet access. Later, the model files can be bundled locally for a more offline app.
