/// # Provenance Contract — Integration Tests (#654)
///
/// Covers the main invocation paths: mint, get, revoke, transfer, rollback,
/// and lock. Validates storage mutations and event emission at each step.
#[cfg(test)]
mod provenance_integration_tests {
    extern crate std;
    use std::format;
    use std::string::ToString;

    use crate::{
        CertificateRollbackRecord, ProvenanceContract, ProvenanceContractClient, ProvenanceError,
        RevocationReason, RollbackReason,
    };
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger as _},
        Address, Env, String,
    };

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn make_env() -> Env {
        Env::default()
    }

    fn s(env: &Env, v: &str) -> String {
        String::from_str(env, v)
    }

    /// Deploy a fresh contract and return (contract_id, oracle_address).
    fn setup(env: &Env) -> (Address, Address) {
        env.mock_all_auths();
        let cid = env.register_contract(None, ProvenanceContract);
        let oracle = Address::generate(env);
        let client = ProvenanceContractClient::new(env, &cid);
        client.initialize(&oracle);
        (cid, oracle)
    }

    /// Mint one certificate, returns the certificate id.
    fn mint_one(
        env: &Env,
        client: &ProvenanceContractClient,
        suffix: &str,
        owner: &Address,
    ) -> u64 {
        client.mint(
            &s(env, &format!("ipfs://Qm{suffix}")),
            &s(env, &format!("manifest_{suffix}")),
            &s(env, &format!("attestation_{suffix}")),
            owner,
        )
    }

    // -----------------------------------------------------------------------
    // Mint — happy path
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_creates_certificate_with_correct_fields() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let owner = Address::generate(&env);

        let id = mint_one(&env, &client, "abc", &owner);

        let cert = client.get(&id);
        assert_eq!(cert.creator, owner);
        assert!(!cert.revoked);
        assert_eq!(cert.manifest_hash, s(&env, "manifest_abc"));
        assert_eq!(cert.attestation_hash, s(&env, "attestation_abc"));
    }

    // -----------------------------------------------------------------------
    // Mint — duplicate rejection
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_rejects_duplicate_manifest_hash() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let owner = Address::generate(&env);

        // First mint succeeds
        mint_one(&env, &client, "dup", &owner);

        // Second mint with the same manifest hash must fail
        let result = client.try_mint(
            &s(&env, "ipfs://QmDup"),
            &s(&env, "manifest_dup"), // same hash
            &s(&env, "attestation_dup2"),
            &owner,
        );
        assert!(result.is_err(), "duplicate manifest hash must be rejected");
    }

    // -----------------------------------------------------------------------
    // Mint — auto-incrementing IDs
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_ids_are_monotonically_increasing() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let owner = Address::generate(&env);

        let mut last = 0u64;
        for i in 0..5u8 {
            let id = mint_one(&env, &client, &i.to_string(), &owner);
            assert!(id > last, "id {id} must exceed previous id {last}");
            last = id;
        }
    }

    // -----------------------------------------------------------------------
    // Revoke — state transition
    // -----------------------------------------------------------------------

    #[test]
    fn test_revoke_sets_revoked_flag_and_reason() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let owner = Address::generate(&env);

        let id = mint_one(&env, &client, "rev", &owner);

        client.revoke_certificate(&id, &RevocationReason::FraudulentContent);

        let cert = client.get(&id);
        assert!(cert.revoked, "certificate must be revoked");
        assert_eq!(cert.revocation_reason, RevocationReason::FraudulentContent);
        assert!(
            cert.revocation_timestamp.is_some(),
            "revocation timestamp must be set"
        );
    }

    // -----------------------------------------------------------------------
    // Revoke — cannot revoke twice
    // -----------------------------------------------------------------------

    #[test]
    fn test_revoke_already_revoked_returns_error() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let owner = Address::generate(&env);

        let id = mint_one(&env, &client, "rev2", &owner);
        client.revoke_certificate(&id, &RevocationReason::LegalRequirement);

        let second = client.try_revoke_certificate(&id, &RevocationReason::CreatorRequest);
        assert!(
            second.is_err(),
            "revoking an already-revoked cert must fail"
        );
    }

    // -----------------------------------------------------------------------
    // Transfer — ownership change persisted
    // -----------------------------------------------------------------------

    #[test]
    fn test_transfer_certificate_updates_owner() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let original_owner = Address::generate(&env);
        let new_owner = Address::generate(&env);

        let id = mint_one(&env, &client, "xfr", &original_owner);

        client.transfer_certificate(&id, &new_owner);

        let owner_after = client.get_owner(&id);
        assert_eq!(
            owner_after, new_owner,
            "owner must be updated after transfer"
        );
    }

    // -----------------------------------------------------------------------
    // Lock — certificate cannot be modified after locking
    // -----------------------------------------------------------------------

    #[test]
    fn test_lock_certificate_prevents_further_changes() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let owner = Address::generate(&env);

        let id = mint_one(&env, &client, "lock", &owner);
        client.lock_certificate(&id);

        let cert = client.get(&id);
        assert!(cert.locked, "certificate must be marked locked");

        // Attempting to revoke a locked cert should fail
        let result = client.try_revoke_certificate(&id, &RevocationReason::CreatorRequest);
        assert!(result.is_err(), "locked certificate must reject revocation");
    }

    // -----------------------------------------------------------------------
    // Rollback record (#658) — record_rollback stores history
    // -----------------------------------------------------------------------

    #[test]
    fn test_record_rollback_appends_to_history() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let owner = Address::generate(&env);
        let initiator = Address::generate(&env);

        let id = mint_one(&env, &client, "rb", &owner);

        // Record two rollbacks
        let rollback_id_1 = client.record_rollback(
            &id,
            &s(&env, "manifest_rb"),
            &s(&env, "manifest_rb_v0"),
            &initiator,
            &RollbackReason::IncorrectAttestation,
        );
        let rollback_id_2 = client.record_rollback(
            &id,
            &s(&env, "manifest_rb_v0"),
            &s(&env, "manifest_rb"),
            &initiator,
            &RollbackReason::CreatorRequest,
        );

        assert!(
            rollback_id_2 > rollback_id_1,
            "rollback ids must be monotonic"
        );

        let history = client.get_rollback_history(&id);
        assert_eq!(history.len(), 2, "both rollback records must be stored");

        let first: CertificateRollbackRecord = history.get(0).unwrap();
        assert_eq!(first.certificate_id, id);
        assert_eq!(first.reason, RollbackReason::IncorrectAttestation);
    }

    // -----------------------------------------------------------------------
    // Events — mint emits an event
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_emits_minted_event() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);
        let owner = Address::generate(&env);

        mint_one(&env, &client, "ev", &owner);

        let events = env.events().all();
        assert!(!events.is_empty(), "mint must emit at least one event");
    }

    // -----------------------------------------------------------------------
    // Storage integrity — get returns NotFound for missing id
    // -----------------------------------------------------------------------

    #[test]
    fn test_get_nonexistent_certificate_returns_error() {
        let env = make_env();
        let (cid, _oracle) = setup(&env);
        let client = ProvenanceContractClient::new(&env, &cid);

        let result = client.try_get(&9999u64);
        assert!(
            result.is_err(),
            "getting a nonexistent certificate must return an error"
        );
    }
}
