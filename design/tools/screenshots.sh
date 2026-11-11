#!/bin/sh
# Screenshots of the component sheet at 390 px and 1280 px in both themes, plus the 390 px roadbook frame.
# macOS: uses headless Google Chrome and sips. Serve the repo first, e.g.  ruby -run -e httpd . -p 8000
# then run from the repo root:  sh design/tools/screenshots.sh http://localhost:8000
# Headless Chrome won't make a window narrower than about 500 px, so each shot loads the page inside
# design/tools/frame.html at the exact width, centred in the window, and sips centre-crops the image to it.
# Long pages are cut into chunks of 8200 px. Page heights are passed in (H390, H1280) because headless
# Chrome can't report them; check them in a browser (document.documentElement.scrollHeight) if the sheet changes.
ROOT="${1:-http://localhost:8000}"
PAGE="$ROOT/design/components.html"; FRAME="$ROOT/design/tools/frame.html"
H390="${H390:-32501}"; H1280="${H1280:-16167}"; CHUNK=8200
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="design/screenshots"; PROF="$(mktemp -d)"
mkdir -p "$OUT"
enc() { printf '%s' "$1" | sed -e 's/%/%25/g' -e 's/&/%26/g' -e 's/?/%3F/g' -e 's/=/%3D/g' -e 's/:/%3A/g' -e 's#/#%2F#g'; }
# shot URL width height file scale
shot() {
  win=$(( $2 + 200 )); hgt=$(( $3 + 200 ))   # headroom round the centred frame, then centre-crop to it
  "$CH" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$PROF" \
    --force-device-scale-factor="$5" --virtual-time-budget=6000 --window-size="$win,$hgt" \
    --screenshot="$4" "$FRAME?w=$2&h=$3&src=$(enc "$1")" >/dev/null 2>&1
  sips -c $(( $3 * $5 )) $(( $2 * $5 )) "$4" >/dev/null
}
for theme in light dark; do
  for w in 390 1280; do
    if [ "$w" = 390 ]; then H=$H390; else H=$H1280; fi
    n=$(( (H + CHUNK - 1) / CHUNK )); i=1; y=0
    while [ $i -le $n ]; do
      left=$(( H - y )); h=$CHUNK; [ $left -lt $CHUNK ] && h=$left
      shot "$PAGE?theme=$theme&y=$y" "$w" "$h" "$OUT/components-$w-$theme-$i-of-$n.png" 1
      i=$((i + 1)); y=$((y + CHUNK))
    done
  done
  shot "$PAGE?frame=1&theme=$theme" 390 844 "$OUT/roadbook-390-$theme.png" 2
done
ls -1 "$OUT"
