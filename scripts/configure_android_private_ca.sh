#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RAW="$ROOT/android-app/android/app/src/debug/res/raw"
XML="$ROOT/android-app/android/app/src/debug/res/xml"
DEBUG_CERT="$RAW/histoannotator_private_ca.crt"
DEBUG_XML="$XML/network_security_config.xml"

CERT="${HISTOANNOTATOR_ANDROID_CA_CERT:-}"

if [[ -z "$CERT" && -f "$DEBUG_CERT" ]]; then
  CERT="$DEBUG_CERT"
  echo "Using existing local ignored Android CA:"
  echo "  $DEBUG_CERT"
fi

if [[ -z "$CERT" ]]; then
  rm -f "$DEBUG_XML"
  echo "No private CA configured."
  echo "Android will use src/main network security policy."
  exit 0
fi

if [[ ! -f "$CERT" ]]; then
  echo "ERROR: certificate not found: $CERT"
  exit 1
fi

mkdir -p "$RAW" "$XML"

SRC_REAL="$(readlink -f "$CERT")"
DST_REAL="$(readlink -f "$DEBUG_CERT" 2>/dev/null || true)"

if [[ "$SRC_REAL" != "$DST_REAL" ]]; then
  cp "$CERT" "$DEBUG_CERT"
fi

cat > "$DEBUG_XML" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
            <certificates src="@raw/histoannotator_private_ca" />
        </trust-anchors>
    </base-config>
</network-security-config>
XML

echo "OK: local debug CA configured"
echo "OK: system + user + bundled private CA trusted"
echo "OK: trusted-LAN HTTP permitted"

openssl x509 \
  -in "$DEBUG_CERT" \
  -noout \
  -subject \
  -issuer \
  -fingerprint \
  -sha256
