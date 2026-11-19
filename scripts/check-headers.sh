#!/usr/bin/env bash
# Uses only bash 3.2 features (what macOS ships), curl and node.
set -euo pipefail

url="${1:-}"
attempts="${2:-3}"
pause="${3:-10}"
if [ -z "$url" ]; then
  echo "usage: $0 <url> [attempts] [seconds-between-attempts]" >&2
  exit 2
fi

expected=$(node -e '
  const config = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const { key, value } of config.headers.find((rule) => rule.source === "/(.*)").headers) {
    console.log(key.toLowerCase() + "\t" + value);
  }
' "$(dirname "$0")/../vercel.json")

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# curl -I lines end in CRLF, so the \r is stripped; `|| true` keeps a no-match
# from killing the script under `set -e -o pipefail`.
header_value() {
  printf '%s\n' "$1" | tr -d '\r' | grep -i "^$2:" | head -n 1 \
    | cut -d: -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true
}

failures=0
ok()   { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

require_value() {
  local name="$1" want="$2" got
  got=$(header_value "$raw" "$name")
  if [ "$got" = "$want" ]; then ok "$name: $got"
  else fail "$name: expected '$want', got '${got:-missing}'"; fi
}

attempt=1
while :; do
  echo "== attempt $attempt of $attempts: curl -sI $url"
  raw=$(curl -sS -I --max-time 20 "$url" || true)
  failures=0

  if [ -z "$raw" ]; then
    fail "no response from $url"
  else
    status=$(printf '%s\n' "$raw" | tr -d '\r' | head -n 1)
    case "$status" in
      *" 200"*) ok "status: $status" ;;
      *)        fail "status: ${status:-none} (expected 200; check the www host, not the apex redirect)" ;;
    esac

    while IFS=$'\t' read -r name value; do
      require_value "$name" "$value"
    done <<< "$expected"

    csp=$(lower "$(header_value "$raw" "content-security-policy")")
    case "$csp" in
      *"frame-ancestors 'none'"*) ok "content-security-policy contains frame-ancestors 'none'" ;;
      *) fail "content-security-policy does not contain frame-ancestors 'none'" ;;
    esac
    case "$csp" in
      *"'unsafe-eval'"*) fail "content-security-policy contains 'unsafe-eval'" ;;
      *) ok "content-security-policy has no 'unsafe-eval'" ;;
    esac
  fi

  if [ "$failures" -eq 0 ]; then
    echo "check-headers: $url serves every header vercel.json sets, with its exact value"
    exit 0
  fi
  if [ "$attempt" -ge "$attempts" ]; then
    echo "check-headers: $failures requirement(s) failed on $url after $attempts attempt(s)" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  echo "   retrying in ${pause}s"
  sleep "$pause"
done
