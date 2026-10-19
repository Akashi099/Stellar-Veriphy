#!/usr/bin/env bash
# Audit trail for environment configuration changes.
# Usage:
#   config-audit.sh record KEY VALUE [ENV]   # log a change (value is masked)
#   config-audit.sh diff OLD.env NEW.env [ENV] # log all changes between env files
#   config-audit.sh show [N]                 # show last N entries (default 20)
# Log: JSON Lines at $CONFIG_AUDIT_LOG (default: ./logs/config-audit.jsonl). Retain >= 1 year.
set -euo pipefail

LOG="${CONFIG_AUDIT_LOG:-./logs/config-audit.jsonl}"
OWNER="${CONFIG_AUDIT_OWNER:-$(git config user.email 2>/dev/null || whoami)}"
mkdir -p "$(dirname "$LOG")"

mask() {
  local k="$1" v="$2"
  if [[ "$k" =~ (SECRET|KEY|TOKEN|PASSWORD|PRIVATE|CREDENTIAL) ]]; then
    echo "***REDACTED***"
  elif (( ${#v} > 8 )); then
    echo "${v:0:4}…${v: -2}"
  else
    echo "$v"
  fi
}

log_entry() {
  local key="$1" action="$2" val="$3" env="${4:-unknown}"
  printf '{"ts":"%s","owner":"%s","env":"%s","key":"%s","action":"%s","value":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$OWNER" "$env" "$key" "$action" "$(mask "$key" "$val")" >> "$LOG"
}

case "${1:-}" in
  record) log_entry "$2" set "$3" "${4:-}" ;;
  diff)
    declare -A old new
    while IFS='=' read -r k v; do [[ -n "$k" && "$k" != \#* ]] && old[$k]="$v"; done < "$2"
    while IFS='=' read -r k v; do [[ -n "$k" && "$k" != \#* ]] && new[$k]="$v"; done < "$3"
    for k in "${!new[@]}"; do
      if [[ -z "${old[$k]+x}" ]]; then log_entry "$k" added "${new[$k]}" "${4:-}"
      elif [[ "${old[$k]}" != "${new[$k]}" ]]; then log_entry "$k" changed "${new[$k]}" "${4:-}"; fi
    done
    for k in "${!old[@]}"; do [[ -z "${new[$k]+x}" ]] && log_entry "$k" removed "" "${4:-}"; done
    ;;
  show) tail -n "${2:-20}" "$LOG" 2>/dev/null || echo "No audit entries." ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
