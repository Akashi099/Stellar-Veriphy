//! Smoke tests for the registry contract.
//!
//! Each test walks one core governance flow end to end on a local Soroban
//! environment. They are named `smoke_*` so `cargo test smoke_` (or
//! `scripts/contracts-smoke.sh`) runs only this suite.

use crate::{Error, RegistryContract, RegistryContractClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

fn setup(env: &Env) -> RegistryContractClient<'_> {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, RegistryContract);
    let client = RegistryContractClient::new(env, &contract_id);
    client.init(&Address::generate(env), &Address::generate(env));
    client
}

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

#[test]
fn smoke_approved_tee_hash_is_accepted_and_unknown_hash_is_not() {
    let env = Env::default();
    let client = setup(&env);
    let approved = hash(&env, 1);

    client.add_tee_hash(&approved);

    assert!(client.is_tee_hash_approved(&approved));
    assert!(
        !client.is_tee_hash_approved(&hash(&env, 2)),
        "a hash that was never approved must be rejected"
    );
}

#[test]
fn smoke_registered_provider_is_authorized() {
    let env = Env::default();
    let client = setup(&env);
    let provider = hash(&env, 7);

    client.add_provider(&provider);

    assert!(client.is_provider(&provider));
    assert!(
        client.is_provider_authorized(&provider),
        "a registered, non-blacklisted provider must be authorized"
    );
}

#[test]
fn smoke_blacklisted_provider_is_rejected() {
    let env = Env::default();
    let client = setup(&env);
    let provider = hash(&env, 9);
    client.add_provider(&provider);

    client.blacklist_provider(&provider, &1u32);

    assert!(client.is_blacklisted(&provider));
    let err = client
        .try_is_provider_authorized(&provider)
        .expect_err("a blacklisted provider must not be authorized")
        .expect("expected a contract error, not a host error");
    assert_eq!(err, Error::ProviderBlacklisted);
}
