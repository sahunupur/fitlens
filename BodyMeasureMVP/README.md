# BodyMeasureMVP

A SwiftUI + Vision demo app for rough body measurement estimation from a front-facing full-body photo.

This is a prototype. Measurements are estimated from 2D pose landmarks and user-entered height, so they are not tailoring-grade accurate.

## What It Does

- Enter height in inches
- Pick a photo from gallery or take one with the camera
- Detect body landmarks with Apple Vision
- Draw pose points and body lines over the image
- Estimate bust/chest, waist, hips, shoulders, inseam, and underbust

## Requirements

- Mac with Xcode
- iPhone or iOS Simulator
- iOS 16 or newer recommended
- Free Apple Developer account works for personal device testing

## Create the Xcode Project

1. Open Xcode.
2. Choose **File > New > Project**.
3. Select **iOS > App**.
4. Product Name: `BodyMeasureMVP`
5. Interface: **SwiftUI**
6. Language: **Swift**
7. Minimum Deployments: **iOS 16.0** or newer.
8. Save the project.
9. Delete the default generated `ContentView.swift` and app file.
10. Drag all `.swift` files from this folder into the Xcode project navigator.
11. In the drag dialog, enable **Copy items if needed** and select the app target.
12. Add the camera/photo permission strings from `Info.plist` into your app target's Info settings.

If Xcode already generated an app file named like `BodyMeasureMVPApp.swift`, replace it with the one in this folder or keep only one `@main` app file.

## Add Permissions in Xcode

In Xcode:

1. Select the project in the left navigator.
2. Select the app target.
3. Open the **Info** tab.
4. Add:
   - `Privacy - Camera Usage Description`
   - `Privacy - Photo Library Usage Description`

Suggested values:

- Camera: `This demo uses the camera to capture a full-body photo for local body landmark detection.`
- Photo Library: `This demo lets you select a photo for local body landmark detection.`

## Run on iPhone

1. Connect your iPhone to the Mac with USB.
2. Unlock the iPhone and tap **Trust This Computer** if prompted.
3. In Xcode, select your iPhone from the device menu near the Run button.
4. Select the project target.
5. Under **Signing & Capabilities**, choose your Apple ID team.
6. Change the bundle identifier to something unique, for example:
   - `com.yourname.BodyMeasureMVP`
7. Press **Run**.

The first install may fail until you trust your developer profile:

1. On iPhone, open **Settings**.
2. Go to **General > VPN & Device Management**.
3. Tap your Apple ID developer profile.
4. Tap **Trust**.
5. Run the app from Xcode again.

## Run on Simulator

The photo picker works in Simulator, but camera capture usually does not because the Simulator has no real camera source.

1. Pick an iPhone Simulator in Xcode.
2. Press **Run**.
3. Use **Gallery** and choose an image available in the simulated photo library.

## Better Test Photos

Use:

- Full body visible from head/neck to ankles
- Front-facing pose
- Good lighting
- Fitted clothing
- Neutral stance
- Camera at about waist or chest height

Avoid:

- Cropped legs
- Baggy clothing
- Side poses
- Mirror distortion
- Arms covering torso

## Accuracy Notes

This MVP uses simple landmark ratios. A production app should improve accuracy with:

- Front and side photos
- A calibration object such as a credit card or A4 paper
- Body segmentation
- Camera distance guidance
- A trained CoreML regression model
- Separate foot capture flow for shoe size

Expected prototype accuracy:

- Shoulder/inseam: useful rough estimates if landmarks are visible
- Bust/waist/hip: rough sizing only
- Bra cup and shoe size: should be added as separate workflows, not trusted from one front image
