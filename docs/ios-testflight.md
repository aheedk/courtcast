# CourtClimate iOS TestFlight Setup

This project now uses Capacitor to turn the existing Vite app into an iOS app.

## Local Prereqs

- Full Xcode from the Mac App Store, not only Command Line Tools.
- CocoaPods: `brew install cocoapods`.
- Node 20 and npm 10, matching the current web app setup.
- An Apple Developer account with App Store Connect access.

After installing Xcode, select it:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version
```

## Fastest TestFlight Build

The quickest internal TestFlight build loads the production website inside the iOS shell. That keeps Google Maps, Google Sign-In, cookies, and server routing on the same origin as production while we validate the native package.

```bash
cd client
npm install
npm run ios:add       # only needed once, if ios/ does not exist yet
npm run ios:sync:hosted
npm run ios:open
```

In Xcode:

1. Select the `App` target.
2. Set the Team.
3. Confirm bundle identifier `com.courtclimate.app`.
4. Confirm `Signing & Capabilities` includes Sign in with Apple.
5. Set the version and build number.
6. Choose `Any iOS Device (arm64)`.
7. Use `Product > Archive`.
8. Distribute to App Store Connect, then enable the build in TestFlight.

## Bundled Native Build

A bundled build ships the built Vite files inside the app and calls the production API. Copy the iOS env example first:

```bash
cp client/.env.ios.example client/.env.ios
```

Fill in the Google keys, then run:

```bash
cd client
npm run ios:sync
npm run ios:open
```

Before using bundled native builds in production, set the server env:

```bash
CLIENT_ORIGINS=https://courtclimate.com,capacitor://localhost,ionic://localhost
APPLE_CLIENT_ID=com.courtclimate.app
```

The bundled path may also need Google Cloud key updates because the app runs from Capacitor's local iOS origin instead of `https://courtclimate.com`.

## Notes

- `CAPACITOR_SERVER_URL=https://courtclimate.com` is only used by `npm run ios:sync:hosted`.
- The website remains the source of truth; normal web deploys still use the existing Railway flow.
- iOS location permission is declared in `client/ios/App/App/Info.plist` because the map uses the user's location to find nearby courts.
- Native iOS Sign in with Apple is enabled through `client/ios/App/App/App.entitlements`.
- Long term, native map rendering would make this feel less like a web shell, but it is not required for the first internal TestFlight.
