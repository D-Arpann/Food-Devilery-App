#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

WEB_PORT="${WEB_PORT:-5173}"
MOBILE_PORT="${MOBILE_PORT:-8081}"
AVD_NAME="${AVD_NAME:-}"
WEB_PID=""
ANDROID_SERIAL_SELECTED=""
EXPO_DEVICE_SELECTED=""

cleanup() {
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" >/dev/null 2>&1; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

ask_choice() {
  local prompt="$1"
  local default="$2"
  local answer

  read -r -p "$prompt " answer
  answer="${answer:-$default}"
  printf '%s' "$(tr '[:upper:]' '[:lower:]' <<<"$answer")"
}

normalize_choice() {
  printf '%s' "$(tr '[:upper:]' '[:lower:]' <<<"$1")"
}

port_is_busy() {
  ss -ltn "sport = :$1" | awk 'NR > 1 { found = 1 } END { exit !found }'
}

start_web() {
  if port_is_busy "$WEB_PORT"; then
    echo "Web already running on http://localhost:${WEB_PORT}"
    return
  fi

  echo "Starting web server on http://localhost:${WEB_PORT}"
  npm run dev --workspace @repo/web -- --host 0.0.0.0 --port "$WEB_PORT" &
  WEB_PID=$!
}

first_avd() {
  if [[ -n "$AVD_NAME" ]]; then
    printf '%s' "$AVD_NAME"
    return
  fi

  if command -v emulator >/dev/null 2>&1; then
    emulator -list-avds | head -n 1
  fi
}

wait_for_android() {
  local serial="$1"

  adb -s "$serial" wait-for-device
  until [[ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 2
  done
}

expo_name_for_attached_serial() {
  local serial="$1"
  local line part

  line="$(adb devices -l | awk -v serial="$serial" '$1 == serial { print; exit }')"
  for part in $line; do
    if [[ "$part" == model:* ]]; then
      printf '%s' "${part#model:}"
      return
    fi
  done

  printf 'Device %s' "$serial"
}

expo_name_for_emulator_serial() {
  local serial="$1"

  adb -s "$serial" emu avd name 2>/dev/null | tr -d '\r' | awk 'NF { print; exit }'
}

wait_for_emulator_serial() {
  local serial
  local deadline=$((SECONDS + 180))

  while (( SECONDS < deadline )); do
    serial="$(adb devices | awk 'NR > 1 && $2 == "device" && $1 ~ /^emulator-/ { print $1; exit }')"
    if [[ -n "$serial" ]]; then
      printf '%s' "$serial"
      return
    fi
    sleep 2
  done

  echo "Timed out waiting for Android emulator to appear in adb." >&2
  exit 1
}

pick_phone() {
  local serials
  mapfile -t serials < <(adb devices | awk 'NR > 1 && $2 == "device" && $1 !~ /^emulator-/ { print $1 }')

  if [[ "${#serials[@]}" -eq 0 ]]; then
    if adb devices | awk 'NR > 1 && $2 == "unauthorized" && $1 !~ /^emulator-/ { found = 1 } END { exit !found }'; then
      echo "Phone is connected but unauthorized. Accept the USB debugging prompt on the phone, then run ./run.sh again." >&2
    else
      echo "No authorized connected phone found." >&2
    fi
    exit 1
  fi

  ANDROID_SERIAL_SELECTED="${serials[0]}"
  EXPO_DEVICE_SELECTED="$(expo_name_for_attached_serial "$ANDROID_SERIAL_SELECTED")"
}

pick_emulator() {
  local serial
  serial="$(adb devices | awk 'NR > 1 && $2 == "device" && $1 ~ /^emulator-/ { print $1; exit }')"

  if [[ -n "$serial" ]]; then
    ANDROID_SERIAL_SELECTED="$serial"
    EXPO_DEVICE_SELECTED="$(expo_name_for_emulator_serial "$ANDROID_SERIAL_SELECTED")"
    return
  fi

  local avd
  avd="$(first_avd)"
  if [[ -z "$avd" ]]; then
    echo "No Android emulator is running and no AVD was found. Set AVD_NAME and try again." >&2
    exit 1
  fi

  echo "Starting Android emulator: $avd" >&2
  emulator -avd "$avd" -gpu swiftshader_indirect -no-audio -no-boot-anim >/tmp/chito-mitho-emulator.log 2>&1 &
  serial="$(wait_for_emulator_serial)"
  wait_for_android "$serial"
  ANDROID_SERIAL_SELECTED="$serial"
  EXPO_DEVICE_SELECTED="$avd"
}

start_mobile() {
  local target="$1"

  case "$target" in
    x|expo)
      start_expo
      return
      ;;
    p|phone|connected|device)
      pick_phone
      ;;
    e|emulator|emu)
      pick_emulator
      ;;
    *)
      echo "Unknown mobile target: $target"
      exit 1
      ;;
  esac

  if [[ -z "$ANDROID_SERIAL_SELECTED" ]] || [[ -z "$EXPO_DEVICE_SELECTED" ]]; then
    echo "Unable to resolve Android target for Expo." >&2
    exit 1
  fi

  echo "Starting mobile app on ${EXPO_DEVICE_SELECTED} (${ANDROID_SERIAL_SELECTED})"
  adb -s "$ANDROID_SERIAL_SELECTED" reverse "tcp:${MOBILE_PORT}" "tcp:${MOBILE_PORT}" >/dev/null 2>&1 || true
  ANDROID_SERIAL="$ANDROID_SERIAL_SELECTED" EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 npm run android --workspace @repo/mobile -- --device "$EXPO_DEVICE_SELECTED" --port "$MOBILE_PORT"
}

start_expo() {
  echo "Starting Expo dev server on port ${MOBILE_PORT}"
  EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 npm run start --workspace @repo/mobile -- --port "$MOBILE_PORT"
}

run_target="$(normalize_choice "${1:-}")"
if [[ -z "$run_target" ]]; then
  run_target="$(ask_choice 'Run web, mobile, or both? [w/m/b]:' 'b')"
fi

case "$run_target" in
  m|mobile)
    mobile_target="$(normalize_choice "${2:-}")"
    if [[ -z "$mobile_target" ]]; then
      mobile_target="$(ask_choice 'Emulator, phone, or Expo? [e/p/x]:' 'p')"
    fi
    start_mobile "$mobile_target"
    ;;
  w|web)
    start_web
    if [[ -n "$WEB_PID" ]]; then
      wait "$WEB_PID"
    fi
    ;;
  b|both)
    start_web
    mobile_target="$(normalize_choice "${2:-}")"
    if [[ -z "$mobile_target" ]]; then
      mobile_target="$(ask_choice 'Emulator, phone, or Expo? [e/p/x]:' 'p')"
    fi
    start_mobile "$mobile_target"
    if [[ -n "$WEB_PID" ]]; then
      wait "$WEB_PID"
    fi
    ;;
  *)
    echo "Choose w, m, or b."
    exit 1
    ;;
esac
