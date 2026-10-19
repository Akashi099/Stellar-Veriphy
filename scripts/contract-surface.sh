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
