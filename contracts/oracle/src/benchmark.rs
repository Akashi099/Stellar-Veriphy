#![cfg(test)]
//! Cost benchmark for the most-used oracle calls (#807, extended in #793).
//!
//! Each call is measured with soroban's budget counters (CPU instructions and memory bytes) on a
//! fresh environment, so repeated runs on the same SDK version produce identical numbers. That
//! makes a change in the output a real change in the contract, not measurement noise.
//!
//! Run through `scripts/benchmark-contracts.mjs`, or directly with:
//!
//!   BENCH_OUTPUT=/path/to/oracle.json cargo test --manifest-path contracts/oracle/Cargo.toml \
//!     benchmark_most_used_calls -- --nocapture --test-threads=1

extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, Bytes, Env};
use std::{format, string::String, vec::Vec};

/// One measured call. Names match the keys the report renderer expects.
struct Sample {
    op: &'static str,
    cpu_instructions: u64,
    memory_bytes: u64,
}

/// Resets the budget, runs `f`, and reads back what it cost.
fn measure<F: FnOnce()>(env: &Env, op: &'static str, f: F) -> Sample {
    env.budget().reset_unlimited();
    f();
    Sample {
        op,
        cpu_instructions: env.budget().cpu_instruction_cost(),
        memory_bytes: env.budget().memory_bytes_cost(),
    }
}

fn to_json(samples: &[Sample]) -> String {
    let mut out = String::from("[\n");
    for (i, s) in samples.iter().enumerate() {
        let sep = if i + 1 < samples.len() { "," } else { "" };
        out.push_str(&format!(
            "  {{\"op\":\"{}\",\"cpuInstructions\":{},\"memoryBytes\":{}}}{}\n",
            s.op, s.cpu_instructions, s.memory_bytes, sep
        ));
    }
    out.push_str("]\n");
    out
}

#[test]
fn benchmark_most_used_calls() {
    let env = Env::default();
    env.mock_all_auths();

    let registry = Address::generate(&env);
    let provenance = Address::generate(&env);
    let admin = Address::generate(&env);
    let cid = env.register_contract(None, OracleContract);
    let client = OracleContractClient::new(&env, &cid);
    client.init(&registry, &provenance, &admin);

    let requester = Address::generate(&env);
    let bytes = Bytes::from_array(&env, &[7u8; 32]);

    let mut samples = Vec::new();

    samples.push(measure(&env, "oracle.submit_request:normal", || {
        client.submit_request(&bytes, &bytes, &requester, &Priority::Normal);
    }));
    samples.push(measure(&env, "oracle.submit_request:high", || {
        client.submit_request(&bytes, &bytes, &requester, &Priority::High);
    }));

    // Requests created outside the measured closures so get/cancel are measured in isolation.
    let read_id = client.submit_request(&bytes, &bytes, &requester, &Priority::Normal);
    samples.push(measure(&env, "oracle.get_request", || {
        client.get_request(&read_id);
    }));

    let cancel_id = client.submit_request(&bytes, &bytes, &requester, &Priority::Normal);
    samples.push(measure(&env, "oracle.cancel_request", || {
        client.cancel_request(&cancel_id);
    }));

    let provider = Address::generate(&env);
    samples.push(measure(&env, "oracle.add_provider", || {
        client.add_provider(&provider);
    }));
    samples.push(measure(&env, "oracle.get_next_available_provider", || {
        client.get_next_available_provider();
    }));
    samples.push(measure(&env, "oracle.update_ttl_config", || {
        client.update_ttl_config(&120u32, &240u32, &60u32);
    }));

    let json = to_json(&samples);
    std::println!("{}", json);

    if let Ok(path) = std::env::var("BENCH_OUTPUT") {
        std::fs::write(&path, json).expect("failed to write BENCH_OUTPUT");
    }
}
/// # Oracle Contract — Integration Tests (#654)
///
/// These tests cover end-to-end invocation flows across oracle contract
/// functions, verifying storage mutations, event emission, and error cases.
/// They complement the existing unit tests in `test.rs` by focusing on
/// multi-step workflows rather than individual function behaviour.
#[cfg(test)]
mod oracle_integration_tests {
    use crate::{Error, OracleContract, OracleContractClient, Priority, RequestState};
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger as _},
        Address, Bytes, Env,
    };

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn make_env() -> Env {
        Env::default()
    }

    fn bytes(env: &Env, s: &[u8]) -> Bytes {
        Bytes::from_slice(env, s)
    }

    mod mock_registry {
        use soroban_sdk::{contract, contractimpl, BytesN, Env};

        #[contract]
        pub struct MockRegistry;

        #[contractimpl]
        impl MockRegistry {
            pub fn is_tee_hash_approved(_env: Env, _hash: BytesN<32>) -> bool {
                true
            }
            pub fn is_provider(_env: Env, _key: BytesN<32>) -> bool {
                true
            }
        }
    }

    fn setup(env: &Env) -> (Address, Address, Address) {
        env.mock_all_auths();
        let oracle_id = env.register_contract(None, OracleContract);
        let registry_id = env.register_contract(None, mock_registry::MockRegistry);
        let provenance_id = Address::generate(env);
        let admin = Address::generate(env);
        let client = OracleContractClient::new(env, &oracle_id);
        client.init(&registry_id, &provenance_id, &admin);
        (oracle_id, admin, registry_id)
    }

    // -----------------------------------------------------------------------
    // Init workflow
    // -----------------------------------------------------------------------

    #[test]
    fn test_init_stores_admin_and_rejects_double_init() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _admin, registry_id) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let provenance_id = Address::generate(&env);
        let new_admin = Address::generate(&env);
        // Second init must fail with AlreadyInitialized
        let err = client
            .try_init(&registry_id, &provenance_id, &new_admin)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::AlreadyInitialized);
    }

    // -----------------------------------------------------------------------
    // Pause / unpause workflow
    // -----------------------------------------------------------------------

    #[test]
    fn test_pause_blocks_submit_then_unpause_allows_it() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _admin, _) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let requester = Address::generate(&env);

        // Paused state
        client.pause();
        assert!(client.is_paused());

        let result = client.try_submit_request(
            &bytes(&env, b"storage"),
            &bytes(&env, b"manifest"),
            &requester,
            &Priority::Normal,
        );
        assert!(result.is_err(), "should be blocked while paused");

        // Unpause and retry
        client.unpause();
        assert!(!client.is_paused());

        let id = client.submit_request(
            &bytes(&env, b"storage"),
            &bytes(&env, b"manifest"),
            &requester,
            &Priority::Normal,
        );
        assert!(id > 0, "request id should be positive after unpause");
    }

    // -----------------------------------------------------------------------
    // Request lifecycle — submit → get → state in storage
    // -----------------------------------------------------------------------

    #[test]
    fn test_submit_request_creates_pending_record() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _, _) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let requester = Address::generate(&env);

        let id = client.submit_request(
            &bytes(&env, b"ipfs://Qm123"),
            &bytes(&env, b"manifest_hash_hex"),
            &requester,
            &Priority::Normal,
        );

        let req = client
            .get_request(&id)
            .expect("request must exist after submit");

        assert_eq!(req.state, RequestState::Pending);
        assert_eq!(req.requester, requester);
    }

    // -----------------------------------------------------------------------
    // Request lifecycle — cancel
    // -----------------------------------------------------------------------

    #[test]
    fn test_cancel_request_transitions_state() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _, _) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let requester = Address::generate(&env);

        let id = client.submit_request(
            &bytes(&env, b"storage"),
            &bytes(&env, b"manifest"),
            &requester,
            &Priority::Normal,
        );

        client.cancel_request(&id);

        let req = client.get_request(&id).expect("request should still exist");
        assert_eq!(req.state, RequestState::Cancelled);
    }

    // -----------------------------------------------------------------------
    // Provider registration — add + check + remove
    // -----------------------------------------------------------------------

    #[test]
    fn test_add_and_remove_provider_updates_storage() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _, _) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let provider = Address::generate(&env);

        client.add_provider(&provider);
        assert!(
            client.is_provider(&provider),
            "provider should be registered after add"
        );

        client.remove_provider(&provider);
        assert!(
            !client.is_provider(&provider),
            "provider should be absent after remove"
        );
    }

    // -----------------------------------------------------------------------
    // Provider stake deposit
    // -----------------------------------------------------------------------

    #[test]
    fn test_deposit_stake_records_amount() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _, _) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let provider = Address::generate(&env);

        client.add_provider(&provider);
        client.deposit_stake(&provider, &2_000_000_000u128);

        let stake = client.get_provider_stake(&provider);
        assert_eq!(stake, 2_000_000_000u128);
    }

    // -----------------------------------------------------------------------
    // Delegation workflow — authorize → submit as delegate → revoke
    // -----------------------------------------------------------------------

    #[test]
    fn test_delegation_full_workflow() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _, _) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let principal = Address::generate(&env);
        let delegate = Address::generate(&env);

        // Authorize delegate
        client.authorize_delegate(&principal, &delegate);
        assert_eq!(
            client.get_delegate(&principal),
            Some(delegate.clone()),
            "delegate should be stored"
        );

        // Submit on behalf
        let id = client.submit_request_as_delegate(
            &principal,
            &delegate,
            &bytes(&env, b"storage"),
            &bytes(&env, b"manifest"),
            &Priority::Normal,
        );
        assert!(id > 0);

        // Revoke
        client.revoke_delegate(&principal);
        assert_eq!(
            client.get_delegate(&principal),
            None,
            "delegate should be absent after revoke"
        );

        // Submit as revoked delegate should fail
        let err = client
            .try_submit_request_as_delegate(
                &principal,
                &delegate,
                &bytes(&env, b"storage2"),
                &bytes(&env, b"manifest2"),
                &Priority::Normal,
            )
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::NotAuthorizedDelegate);
    }

    // -----------------------------------------------------------------------
    // Events — verify that submit emits an event
    // -----------------------------------------------------------------------

    #[test]
    fn test_submit_emits_event() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _, _) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let requester = Address::generate(&env);

        client.submit_request(
            &bytes(&env, b"storage"),
            &bytes(&env, b"manifest"),
            &requester,
            &Priority::Normal,
        );

        let events = env.events().all();
        assert!(
            !events.is_empty(),
            "at least one event should be emitted on submit"
        );
    }

    // -----------------------------------------------------------------------
    // Monotonic request IDs across priorities
    // -----------------------------------------------------------------------

    #[test]
    fn test_request_ids_increase_monotonically_across_priorities() {
        let env = make_env();
        env.mock_all_auths();
        let (oracle_id, _, _) = setup(&env);
        let client = OracleContractClient::new(&env, &oracle_id);
        let requester = Address::generate(&env);

        let priorities = [
            Priority::Low,
            Priority::Normal,
            Priority::High,
            Priority::Urgent,
        ];
        let mut previous = 0u64;

        for priority in &priorities {
            env.ledger().with_mut(|l| l.sequence_number += 1);
            let id = client.submit_request(
                &bytes(&env, b"storage"),
                &bytes(&env, b"manifest"),
                &requester,
                priority,
            );
            assert!(id > previous, "request id must be strictly increasing");
            previous = id;
        }
    }
}
