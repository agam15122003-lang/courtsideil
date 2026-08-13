#!/usr/bin/env bash
# בדיקת פריסה ל-CourtSide — סורקת את **כל** הקטעים, לא מנחשת איזה.
# שימוש:  ./scripts/deploy-check.sh "מחרוזת" ["מחרוזת נוספת"...]
set -u
SITE="${SITE:-https://courtsideil.vercel.app}"
html=$(curl -s -H 'Cache-Control: no-cache' "$SITE/?cb=$RANDOM")
idx=$(echo "$html" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
[ -z "$idx" ] && { echo "לא נמצא קטע index — האתר לא נטען"; exit 1; }
body=$(curl -s -H 'Cache-Control: no-cache' "$SITE/$idx")
chunks=$(echo "$body" | grep -o '"assets/[A-Za-z0-9_-]*\.js"' | tr -d '"' | sort -u)
echo "index: $idx · קטעים: $(echo "$chunks" | wc -l)"
fail=0
for needle in "$@"; do
  found=""
  for c in $idx $chunks; do
    curl -s "$SITE/$c" | grep -q -- "$needle" && { found="$c"; break; }
  done
  if [ -n "$found" ]; then echo "  ✔ $needle → $found"
  else echo "  ✘ $needle — לא נמצא באף קטע"; fail=1; fi
done
exit $fail
