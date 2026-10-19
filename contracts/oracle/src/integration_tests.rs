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
