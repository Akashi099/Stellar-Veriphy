#!/usr/bin/env bash
# =============================================================================
# contract-surface.sh
#
# Extraction helpers shared by snapshot-contract-state.sh (writes the baselines)
# and upgrade-safety-check.sh (compares the current source with them). Both use
# these functions, so the two sides always produce the same format.
#
# Sourced, not executed. Each function takes a contract source file as $1 and
# prints sorted lines. Each prints nothing and returns 0 when nothing matches.
# =============================================================================

# Structs whose layout is persisted on-chain. Changing one can break stored entries.
KEY_STRUCTS="ProvenanceCert VerificationRequest ProviderSLA CostEstimate ProviderInfo ProviderReputation TeeHashRecord"

# One name per DataKey variant used in the source.
surface_datakeys() {
  grep -oP '(?<=DataKey::)\w+' "$1" | sort -u || true
}

# One line per persisted field: "<Struct><TAB><field declaration without trailing comma>".
surface_struct_fields() {
  local name
  for name in $KEY_STRUCTS; do
    awk -v name="$name" '
      $0 ~ ("^pub struct " name "[[:space:]]*[{]") { inside = 1; next }
      inside && /^[}]/ { inside = 0 }
      inside && /^[[:space:]]*pub [a-z_0-9]+:/ {
        decl = $0
        sub(/^[[:space:]]+/, "", decl)
        sub(/,[[:space:]]*$/, "", decl)
        print name "\t" decl
      }
    ' "$1"
  done | sort || true
}

# Public entry points: methods declared at contract-impl indentation.
surface_entry_points() {
  grep -oP '^    pub fn \K[a-z_0-9]+' "$1" | sort -u || true
}

# Field name from a "<Struct><TAB>pub name: Type" line.
surface_field_name() {
  sed -E 's/^.*pub ([a-z_0-9]+):.*$/\1/' <<<"$1"
}

# Struct name from a "<Struct><TAB>pub name: Type" line.
surface_struct_name() {
  printf '%s\n' "${1%%$'\t'*}"
}

# Guards that mark an entry point as privileged. Keep in sync with the
# access policy matrix in SECURITY.md.
PRIVILEGE_GUARDS="require_admin|require_policy_authority"

# Privileged entry points: public methods whose body calls a privilege guard.
# Prints one "<fn><TAB><guard>" line per privileged method, sorted.
surface_privileged_entry_points() {
  awk -v guards="$PRIVILEGE_GUARDS" '
    /^    pub fn [a-z_0-9]+/ {
      fn = $0
      sub(/^    pub fn /, "", fn)
      sub(/[^a-z_0-9].*$/, "", fn)
      current = fn
      next
    }
    current != "" && $0 ~ ("(" guards ")") {
      guard = $0
      sub(/^.*(require_admin|require_policy_authority).*$/, "\\1", guard)
      print current "\t" guard
      current = ""
    }
  ' "$1" | sort -u || true
}

# Check mode: compare the privileged entry points of a contract source ($1)
# against the access policy matrix in the docs file ($2). Prints one line per
# drift and returns non-zero when the matrix is out of sync.
#
# A matrix row is any line mentioning the function name; the row must also
# name the guard that gates it.
surface_check_access_matrix() {
  local source="$1" matrix="$2" status=0 fn guard
  if [ ! -f "$matrix" ]; then
    echo "access matrix not found: $matrix" >&2
    return 1
  fi
  while IFS=$'\t' read -r fn guard; do
    [ -n "$fn" ] || continue
    if ! grep -q -- "$fn" "$matrix"; then
      echo "missing from access matrix: $fn (guarded by $guard)"
      status=1
    elif ! grep -- "$fn" "$matrix" | grep -q -- "$guard"; then
      echo "guard mismatch in access matrix: $fn (expected $guard)"
      status=1
    fi
  done < <(surface_privileged_entry_points "$source")
  return "$status"
}
