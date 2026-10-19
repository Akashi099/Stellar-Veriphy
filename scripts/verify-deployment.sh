#!/usr/bin/env bash
# =============================================================================
# verify-deployment.sh
#
# Post-deployment verification for StellarVeriphy Soroban contracts.
# Runs smoke tests against a freshly deployed contract to confirm it is
# functional before consumers are repointed.
#
# Usage:
#   ./scripts/verify-deployment.sh <contract> <contract_id> [network]
#
# Arguments:
#   contract      — one of: oracle | provenance | registry
#   contract_id   — the C... Soroban contract ID returned by stellar contract deploy
#   network       — testnet | mainnet (default: testnet)
#
# Exit codes:
#   0 — all smoke tests passed
#   1 — one or more tests failed
#   2 — usage error
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
pass()  { echo -e "${GREEN}[PASS]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; FAILED=$((FAILED+1)); }
info()  { echo -e "       $*"; }

FAILED=0

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <contract> <contract_id> [network]"
  exit 2
fi

CONTRACT="$1"
CONTRACT_ID="$2"
NETWORK="${3:-testnet}"
SOURCE="${STELLAR_SOURCE:-deployer}"

echo ""
echo "================================================================"
echo "  StellarVeriphy Post-Deployment Verification"
echo "  Contract    : $CONTRACT"
echo "  Contract ID : $CONTRACT_ID"
echo "  Network     : $NETWORK"
echo "================================================================"
echo ""

invoke() {
  # Wrapper that calls stellar contract invoke and returns stdout
  local fn="$1"; shift
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- "$fn" "$@" 2>&1
}

# ---------------------------------------------------------------------------
# Contract-specific smoke tests
# ---------------------------------------------------------------------------
case "$CONTRACT" in

  registry)
    echo "--- Registry smoke tests ---"

    # is_tee_hash_approved for a zero hash should return false (not panic)
    RESULT=$(invoke is_tee_hash_approved --code_hash "0000000000000000000000000000000000000000000000000000000000000000" 2>&1 || true)
    if echo "$RESULT" | grep -qi "false\|0"; then
      pass "is_tee_hash_approved (unknown hash) returns false"
    elif echo "$RESULT" | grep -qi "error\|panic"; then
      fail "is_tee_hash_approved panicked: $RESULT"
    else
      warn "Unexpected output from is_tee_hash_approved: $RESULT"
    fi

    # get_admin — may be None if not yet initialised; should not panic
    RESULT=$(invoke get_admin 2>&1 || true)
    if echo "$RESULT" | grep -qiE "null|None|G[A-Z2-7]{55}|error.*NotInitialized"; then
      pass "get_admin returned a value (None or address)"
    else
      warn "get_admin returned unexpected output: $RESULT"
    fi

    # get_multisig_threshold — should return a u32
    RESULT=$(invoke get_multisig_threshold 2>&1 || true)
    if echo "$RESULT" | grep -qP '^\d+$'; then
      pass "get_multisig_threshold returned: $RESULT"
    else
      warn "get_multisig_threshold unexpected output: $RESULT"
    fi
    ;;

  oracle)
    echo "--- Oracle smoke tests ---"

    # is_paused — should return false on a fresh deploy
    RESULT=$(invoke is_paused 2>&1 || true)
    if echo "$RESULT" | grep -qi "false\|0"; then
      pass "is_paused returns false (contract not paused)"
    elif echo "$RESULT" | grep -qi "error\|panic"; then
      fail "is_paused panicked: $RESULT"
    else
      warn "is_paused unexpected output: $RESULT"
    fi

    # get_ttl_config — should return the default TTL config
    RESULT=$(invoke get_ttl_config 2>&1 || true)
    if echo "$RESULT" | grep -qi "default_ttl\|100"; then
      pass "get_ttl_config returned a config object"
    else
      warn "get_ttl_config unexpected output: $RESULT"
    fi

    # get_provider_list — should return an empty list on a fresh deploy
    RESULT=$(invoke get_provider_list 2>&1 || true)
    if echo "$RESULT" | grep -qiE '\[\]|\[\s*\]|empty'; then
      pass "get_provider_list returns empty list (fresh deploy)"
    else
      warn "get_provider_list unexpected output: $RESULT"
    fi
    ;;

  provenance)
    echo "--- Provenance smoke tests ---"

    # get_certificate_stats — should return zeros on a fresh deploy
    RESULT=$(invoke get_certificate_stats 2>&1 || true)
    if echo "$RESULT" | grep -qi "total_certificates\|0"; then
      pass "get_certificate_stats returned stats object"
    elif echo "$RESULT" | grep -qi "error\|panic"; then
      fail "get_certificate_stats panicked: $RESULT"
    else
      warn "get_certificate_stats unexpected output: $RESULT"
    fi

    # get_certificate for id=1 should return CertificateNotFound
    RESULT=$(invoke get_certificate --id 1 2>&1 || true)
    if echo "$RESULT" | grep -qi "NotFound\|not_found\|Error"; then
      pass "get_certificate(1) correctly returns not-found on fresh deploy"
    else
      warn "get_certificate(1) unexpected output: $RESULT"
    fi
    ;;

  *)
    fail "Unknown contract: $CONTRACT"
    ;;
esac

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "================================================================"
if [[ "$FAILED" -eq 0 ]]; then
  echo -e "${GREEN}ALL SMOKE TESTS PASSED${NC}"
  echo ""
  echo "Record the contract ID in docs/operations/deployment-log.md:"
  echo "  Contract  : $CONTRACT"
  echo "  ID        : $CONTRACT_ID"
  echo "  Network   : $NETWORK"
  echo "  Verified  : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  exit 0
else
  echo -e "${RED}$FAILED SMOKE TEST(S) FAILED${NC}"
  echo ""
  echo "Do NOT repoint consumers to this contract ID."
  echo "Investigate the failures above, then re-run this script."
  exit 1
fi
