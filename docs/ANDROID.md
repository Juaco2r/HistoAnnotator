# Android build

HistoAnnotator uses Capacitor to package the web frontend as an Android
application.

## Tested development environment

The v1.0 development build has been tested with:

- Node.js 22
- JDK 21
- Android SDK
- Capacitor 8
- Gradle wrapper supplied by the project

The commands below are intended primarily for Linux. Windows users can use
an equivalent environment or WSL where appropriate.

## Install JavaScript dependencies

```bash
cd android-app
npm ci
cd ..
```

## Configure the backend

The backend URL is supplied at build time and is not committed to the
public repository.

```bash
export HISTOANNOTATOR_NATIVE_SERVER="https://your-server.example/annotator"
bash scripts/build_android_web.sh
```

## Synchronize Capacitor

```bash
cd android-app
npx cap sync android
```

## Android SDK

If required, create `android-app/android/local.properties` containing:

```text
sdk.dir=/absolute/path/to/Android/Sdk
```

Do not commit `local.properties`.

## Build a development APK

```bash
cd android
./gradlew assembleDebug
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Private certificate authorities

Institutional deployments may use an internal TLS certificate authority.
Trust configuration for such a CA is environment-specific.

Never commit private keys, signing keys, passwords or keystores.

A public CA certificate is not a private key, but organizations may still
prefer to keep internal infrastructure details outside a public repository.

## Production signing

The v1.0 pre-release APK is intended as a research/testing build. A
production distribution should use an appropriate release signing
configuration and preferably an Android App Bundle where applicable.

## Optional institutional/private CA

The public repository uses the Android system trust store only.

If your backend uses an institutional or private certificate authority,
configure it locally before building the APK:

```bash
HISTOANNOTATOR_ANDROID_CA_CERT=/path/to/root-ca.crt \
  bash scripts/configure_android_private_ca.sh
```

This creates an ignored Android `debug` resource overlay. The private or
deployment-specific CA is therefore not committed to the repository.

Then build normally:

```bash
HISTOANNOTATOR_NATIVE_SERVER="https://your-server.example/annotator" \
  bash scripts/build_android_web.sh

cd android-app
npm ci
npx cap sync android
cd android
./gradlew assembleDebug
```
