# HistoAnnotator Android v1.2.0

HistoAnnotator uses Capacitor for the Android application.

## Public APK

The public v1.2.0 APK is generic. It does not contain a private server address.

After installation:

```text
File → Connection settings
```

You can:

- enter a server URL manually;
- test and save it;
- scan the QR displayed by HistoAnnotator Desktop.

## Desktop LAN connection

Desktop server mode normally advertises a URL such as:

```text
http://192.168.x.x:8765
```

The v1.2.0 Android network configuration allows cleartext HTTP because Desktop
pairing is intended for trusted local LAN/VPN research use.

Do not expose an unauthenticated HistoAnnotator Desktop server to the public
internet.

## HTTPS and institutional CAs

The generic APK trusts Android system and user-installed certificate
authorities.

An institutional/private root CA is not included in the public repository or
public APK.

For a local development APK, an optional CA can be configured with:

```bash
HISTOANNOTATOR_ANDROID_CA_CERT=/path/to/root-ca.crt \
  bash scripts/configure_android_private_ca.sh
```

The generated `src/debug/res` overlay is git-ignored.

## Build

Requirements:

- Node.js 22
- JDK 21
- Android SDK
- Capacitor 8

```bash
cd android-app
npm ci
cd ..

unset HISTOANNOTATOR_NATIVE_SERVER
bash scripts/build_android_web.sh

cd android-app
npx cap sync android
cd android
./gradlew assembleDebug
```

Output:

```text
android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

The public GitHub v1.2.0 workflow builds a generic research APK named:

```text
HistoAnnotator-v1.2.0-Android.apk
```

The APK is a research/testing build and is not clinically validated.
