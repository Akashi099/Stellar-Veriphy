//! Smoke tests for the provenance contract.
//!
//! Each test walks one core certificate flow end to end on a local Soroban
//! environment. They are named `smoke_*` so `cargo test smoke_` (or
//! `scripts/contracts-smoke.sh`) runs only this suite, which stays quick enough
//! for daily development.

use crate::{ProvenanceContract, ProvenanceContractClient, ProvenanceError, RevocationReason};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, String,
};

fn setup(env: &Env) -> ProvenanceContractClient<'_> {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ProvenanceContract);
    let client = ProvenanceContractClient::new(env, &contract_id);
    client.initialize(&Address::generate(env));
    client
}

fn mint(env: &Env, client: &ProvenanceContractClient, manifest: &str, owner: &Address) -> u64 {
    client.mint(
        &String::from_str(env, "ipfs://smoke"),
        &String::from_str(env, manifest),
        &String::from_str(env, "attestation"),
        owner,
    )
}

#[test]
fn smoke_mint_then_read_back_certificate() {
    let env = Env::default();
    let client = setup(&env);
    let owner = Address::generate(&env);

    let id = mint(&env, &client, "manifest-read", &owner);

    let cert = client.get(&id);
    assert_eq!(
        cert.creator, owner,
        "minted certificate must record its creator"
    );
    assert!(!cert.revoked, "a fresh certificate must not be revoked");
    assert!(!cert.locked, "a fresh certificate must not be locked");
    assert_eq!(
        client.get_owner(&id),
        owner,
        "owner must default to the creator"
    );
}

#[test]
fn smoke_transfer_then_lock_blocks_further_transfers() {
    let env = Env::default();
    let client = setup(&env);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);
    let next_buyer = Address::generate(&env);
    let id = mint(&env, &client, "manifest-transfer", &creator);

    client.transfer_certificate(&id, &buyer);
    assert_eq!(
        client.get_owner(&id),
        buyer,
        "transfer must update the owner"
    );

    client.lock_certificate(&id);
    let err = client
        .try_transfer_certificate(&id, &next_buyer)
        .expect_err("a locked certificate must not transfer")
        .expect("expected a contract error, not a host error");
    assert_eq!(err, ProvenanceError::CertificateLocked);
    assert_eq!(
        client.get_owner(&id),
        buyer,
        "a rejected transfer must leave the owner unchanged"
    );
}

#[test]
fn smoke_revoke_marks_certificate_revoked() {
    let env = Env::default();
    let client = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "manifest-revoke", &owner);

    client.revoke_certificate(&id, &RevocationReason::FraudulentContent);

    assert!(
        client.is_certificate_revoked(&id),
        "revoked certificate must report as revoked"
    );
}

#[test]
fn smoke_expiration_and_renewal_flow() {
    let env = Env::default();
    let client = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "manifest-expiry", &owner);

    env.ledger().with_mut(|li| li.timestamp = 1_000);
    client.set_expiration(&id, &Some(2_000));
    assert!(
        !client.is_certificate_expired(&id),
        "not expired before its deadline"
    );

    env.ledger().with_mut(|li| li.timestamp = 2_001);
    assert!(
        client.is_certificate_expired(&id),
        "expired after its deadline"
    );

    client.renew_certificate(&id, &5_000);
    assert!(
        !client.is_certificate_expired(&id),
        "renewing with a future deadline must clear the expired state"
    );
}
