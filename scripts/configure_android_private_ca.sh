#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT="${HISTOANNOTATOR_ANDROID_CA_CERT:-}"

if [[ -z "$CERT" ]]; then
  echo "No private CA configured."
  echo "Android will use the public/system trust store only."
  echo
  echo "For an institutional/private CA:"
  echo "  HISTOANNOTATOR_ANDROID_CA_CERT=/path/to/root-ca.crt \\"
  echo "    bash scripts/configure_android_private_ca.sh"
  exit 0
fi

if [[ ! -f "$CERT" ]]; then
  echo "ERROR: certificate not found: $CERT"
  exit 1
fi

RAW="$ROOT/android-app/android/app/src/debug/res/raw"
XML="$ROOT/android-app/android/app/src/debug/res/xml"

mkdir -p "$RAW" "$XML"

cp "$CERT" "$RAW/histoannotator_private_ca.crt"

cat > "$XML/network_security_config.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="@raw/histoannotator_private_ca" />
        </trust-anchors>
    </base-config>
</network-security-config>
XML

echo "✓ Debug Android private CA configured locally"
openssl x509 \
  -in "$RAW/histoannotator_private_ca.crt" \
  -noout -subject -issuer -fingerprint -sha256
