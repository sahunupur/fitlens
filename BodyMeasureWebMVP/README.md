# FitLens by Nupur Labs

This version is for **Windows + iPhone + Android**. It is an installable PWA, so it can feel like an app on your phone even though it is hosted as a website.

It uses:

- HTML/CSS/JavaScript
- MediaPipe Pose in the browser
- iPhone camera/photo picker through Safari
- Front and side photo capture for better body width and depth estimates
- Rough measurement math from pose landmarks, entered height, profile, and side-view depth
- Installable PWA support for iPhone and Android
- Polished mobile app-style UI under the **FitLens by Nupur Labs** brand
- Female, male, and neutral body-profile modes
- Calibration mode selector for height-only, credit card, paper, or phone reference workflows
- Separate **Camera** and **Upload** actions so users can take a photo or choose from gallery

## Can This Run On Android?

Yes. On your Realme phone, open the hosted HTTPS URL in Chrome. Chrome should offer **Install app** or **Add to Home screen**. This gives you an app-like launcher icon and full-screen standalone mode.

## Fastest Way To Test On iPhone

Because the pose model loads from a CDN and iPhone camera access works best on HTTPS, the easiest path is to host this folder as a tiny static website.

Good free options:

- GitHub Pages
- Netlify
- Vercel

## Option 1: Netlify Drop

1. Zip the `BodyMeasureWebMVP` folder.
2. Go to `https://app.netlify.com/drop`.
3. Drag the zip/folder onto the page.
4. Netlify gives you an HTTPS URL.
5. Open that URL on your iPhone in Safari.
6. Add both **Front view** and **Side view** photos.

## Option 2: GitHub Pages

1. Create a GitHub account if you do not have one.
2. Create a new repository, for example `body-measure-mvp`.
3. Upload the full `BodyMeasureWebMVP` folder, including:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `manifest.webmanifest`
   - `service-worker.js`
   - `icons/`
4. In GitHub, open **Settings > Pages**.
5. Set source to the main branch root.
6. Open the published HTTPS URL on your iPhone.

## Option 3: Run Locally On Windows

Local testing on your Windows browser:

```powershell
cd BodyMeasureWebMVP
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

For your iPhone, local HTTP may let you upload a photo, but camera access is more reliable from an HTTPS hosted URL.

## Add It To Your iPhone Home Screen

1. Open the hosted HTTPS URL in Safari.
2. Tap the Share button.
3. Tap **Add to Home Screen**.
4. Launch it like an app.

## Add It To Your Realme Android Phone

1. Open the hosted HTTPS URL in Chrome.
2. Tap the three-dot menu.
3. Tap **Install app** or **Add to Home screen**.
4. Launch **FitLens** from your app drawer or home screen.

If your phone still shows an older design after redeploying, uninstall the old home-screen app, clear the browser tab, and open the new Netlify link again. PWAs can cache old files until the service worker updates.

## Android APK Option From Windows

You can build a real Android APK from Windows later by wrapping this web app with Capacitor.

Basic route:

1. Install Node.js.
2. Install Android Studio.
3. Enable Developer Options and USB Debugging on your Realme phone.
4. Create a Capacitor Android wrapper.
5. Build and run the APK on your phone with Android Studio.

That Android path is realistic on Windows. Native iPhone builds are the hard part because Apple requires macOS/Xcode for signing.

## Important Limits

This is not a native App Store app yet. It is a prototype you can test on your iPhone or Android phone today from Windows.

## Where Do Photos Go?

Photos are not uploaded to a FitLens server. The selected or captured front and side images are loaded into the browser with temporary local object URLs, drawn on the page canvases, and analyzed in the browser with MediaPipe Pose.

The app downloads the pose-detection library from a CDN, but this prototype does not send your selected image to an app backend or save user photos.

## What Model Is Used?

This prototype uses **MediaPipe Pose** from `@mediapipe/pose` in the browser. It detects human pose landmarks such as shoulders, hips, knees, and ankles.

It does **not** detect exact body circumference, body fat, clothing thickness, or real 3D depth. If a user uploads a non-human photo, the app should reject it with a human-body-detection message instead of showing measurements.

For genuinely close measurements, the next technical step is body segmentation plus a real calibration flow, or a trained model built from real photos paired with actual tape measurements.

For a real App Store iOS app, you eventually need one of these:

- A Mac with Xcode
- A rented cloud Mac
- A build service such as Expo EAS, Codemagic, or Bitrise
- Someone with a Mac to sign and upload the app

Apple Vision specifically is native iOS-only, so the Windows-friendly version uses browser pose detection instead.
