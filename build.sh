#!/usr/bin/env bash
# Build a signed, installable Chess.apk — no Gradle, no Android Studio.
set -euo pipefail

PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK="/tmp/asdk"
WORK="/tmp/chessbuild"
OUT="${1:-/home/user/Chess.apk}"

KEYSTORE="$PROJ/release.keystore"
STOREPASS="serenachess"
ALIAS="chesskey"

if [ ! -d "$SDK/bt" ] || [ ! -d "$SDK/pf" ]; then
  echo ">> fetching Android build-tools + platform ..."
  mkdir -p "$SDK/bt" "$SDK/pf"
  curl -sL -o "$SDK/bt.zip" https://dl.google.com/android/repository/build-tools_r33.0.2-linux.zip
  curl -sL -o "$SDK/pf.zip" https://dl.google.com/android/repository/platform-33_r02.zip
  unzip -qo "$SDK/bt.zip" -d "$SDK/bt"
  unzip -qo "$SDK/pf.zip" -d "$SDK/pf"
fi

BT="$(echo "$SDK"/bt/*/)"
ANDROID_JAR="$(echo "$SDK"/pf/*/android.jar)"
KEYTOOL="$(command -v keytool || echo /usr/lib/jvm/jdk-11/bin/keytool)"

rm -rf "$WORK"; mkdir -p "$WORK/classes" "$WORK/dex" "$WORK/gen"

echo ">> [1/6] aapt2 compile"
"${BT}aapt2" compile --dir "$PROJ/res" -o "$WORK/res.zip"

# Stage the web assets so we can inject secrets without ever writing them
# into a tracked file. local.key is gitignored; without it the build simply
# ships an empty key and the bots fall back to their built-in chat lines.
STAGE="$WORK/assets"
mkdir -p "$STAGE"
cp -r "$PROJ/assets/." "$STAGE/"
if [ -f "$PROJ/local.key" ]; then
  GROQ_KEY="$(tr -d '[:space:]' < "$PROJ/local.key")"
  sed -i "s|__GROQ_KEY__|${GROQ_KEY}|g" "$STAGE/js/chat.js"
  echo ">> injected Groq key from local.key (not in source control)"
else
  sed -i "s|__GROQ_KEY__||g" "$STAGE/js/chat.js"
  echo ">> no local.key found - building without a Groq key"
fi

echo ">> [2/6] aapt2 link  (manifest + assets)"
"${BT}aapt2" link \
  -o "$WORK/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$PROJ/AndroidManifest.xml" \
  -A "$STAGE" \
  --java "$WORK/gen" \
  --min-sdk-version 21 --target-sdk-version 33 \
  --auto-add-overlay \
  "$WORK/res.zip"

echo ">> [3/6] javac"
find "$PROJ/java" "$WORK/gen" -name '*.java' > "$WORK/sources.txt"
if ! javac -nowarn -encoding UTF-8 -source 8 -target 8 \
     -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" \
     -d "$WORK/classes" @"$WORK/sources.txt" 2> "$WORK/javac.log"; then
  echo "!! javac failed:"; grep -i error "$WORK/javac.log" | head -20; exit 1
fi
grep -vi 'bootstrap\|source value\|target value\|deprecat' "$WORK/javac.log" || true

echo ">> [4/6] d8"
find "$WORK/classes" -name '*.class' > "$WORK/classes.txt"
"${BT}d8" --release --lib "$ANDROID_JAR" --min-api 21 --output "$WORK/dex" @"$WORK/classes.txt"
( cd "$WORK/dex" && zip -q "$WORK/base.apk" classes.dex )

echo ">> [5/6] zipalign"
"${BT}zipalign" -p -f 4 "$WORK/base.apk" "$WORK/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo ">> generating signing key"
  "$KEYTOOL" -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 \
    -storepass "$STOREPASS" -keypass "$STOREPASS" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=Serena Chess, OU=Mobile, O=Serena, C=IN" >/dev/null 2>&1
fi

echo ">> [6/6] apksigner"
"${BT}apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$STOREPASS" \
  --ks-key-alias "$ALIAS" --key-pass "pass:$STOREPASS" \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT" "$WORK/aligned.apk"
rm -f "${OUT}.idsig"

echo; "${BT}apksigner" verify --print-certs "$OUT" | head -3
echo; ls -lh "$OUT"; echo ">> DONE: $OUT"
