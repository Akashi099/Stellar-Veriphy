#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env,
};

fn setup_env() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    (env, admin, user)
}

fn set_ledger_timestamp(env: &Env, timestamp: u64) {
    env.ledger().set(LedgerInfo {
        timestamp,
        protocol_version: 20,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6_312_000,
    });
}

#[test]
fn test_stored_timestamp_comes_from_ledger() {
    let (env, admin, user) = setup_env();
    let contract_id = env.register_contract(None, Registry);
    let client = RegistryClient::new(&env, &contract_id);

    let ledger_ts: u64 = 1_700_000_000;
    set_ledger_timestamp(&env, ledger_ts);

    client.initialize(&admin);
    client.register(&user);

    // The stored timestamp must equal env.ledger().timestamp().
    let stored = client.get_timestamp(&user);
    assert_eq!(stored, ledger_ts);
    assert_eq!(stored, env.ledger().timestamp());
}

#[test]
fn test_timestamp_interpreted_as_unix_seconds() {
    let (env, admin, user) = setup_env();
    let contract_id = env.register_contract(None, Registry);
    let client = RegistryClient::new(&env, &contract_id);

    // 2023-11-14T22:13:20Z in Unix seconds.
    let unix_seconds: u64 = 1_700_000_000;
    set_ledger_timestamp(&env, unix_seconds);

    client.initialize(&admin);
    client.register(&user);

    let stored = client.get_timestamp(&user);
    // Sanity: value is in seconds, not milliseconds or nanoseconds.
    assert_eq!(stored, unix_seconds);
    assert!(stored < 10_000_000_000, "timestamp must be seconds, not ms");
}

#[test]
fn test_clock_skew_between_ledger_timestamps() {
    let (env, admin, user_a) = setup_env();
    let user_b = Address::generate(&env);
    let contract_id = env.register_contract(None, Registry);
    let client = RegistryClient::new(&env, &contract_id);

    client.initialize(&admin);

    // First registration at an earlier ledger time.
    let earlier: u64 = 1_000_000;
    set_ledger_timestamp(&env, earlier);
    client.register(&user_a);

    // Simulate clock skew: ledger timestamp moves backwards.
    let skewed: u64 = 900_000;
    set_ledger_timestamp(&env, skewed);
    client.register(&user_b);

    // Each stored timestamp reflects the ledger time at registration,
    // even if the ledger clock moved backwards.
    assert_eq!(client.get_timestamp(&user_a), earlier);
    assert_eq!(client.get_timestamp(&user_b), skewed);
}

#[test]
fn test_equal_timestamps_deterministic_ordering() {
    let (env, admin, user_a) = setup_env();
    let user_b = Address::generate(&env);
    let contract_id = env.register_contract(None, Registry);
    let client = RegistryClient::new(&env, &contract_id);

    client.initialize(&admin);

    let same_ts: u64 = 1_500_000_000;
    set_ledger_timestamp(&env, same_ts);
    client.register(&user_a);
    client.register(&user_b);

    // Both entries share the same timestamp.
    assert_eq!(client.get_timestamp(&user_a), same_ts);
    assert_eq!(client.get_timestamp(&user_b), same_ts);

    // Ordering is deterministic: insertion order is preserved.
    let order = client.get_registration_order();
    assert_eq!(order.len(), 2);
    assert_eq!(order.get(0).unwrap(), user_a);
    assert_eq!(order.get(1).unwrap(), user_b);
}

#[test]
fn test_timestamp_zero_boundary() {
    let (env, admin, user) = setup_env();
    let contract_id = env.register_contract(None, Registry);
    let client = RegistryClient::new(&env, &contract_id);

    set_ledger_timestamp(&env, 0);
    client.initialize(&admin);
    client.register(&user);

    assert_eq!(client.get_timestamp(&user), 0);
    assert_eq!(env.ledger().timestamp(), 0);
}

#[test]
fn test_timestamp_max_u64_boundary() {
    let (env, admin, user) = setup_env();
    let contract_id = env.register_contract(None, Registry);
    let client = RegistryClient::new(&env, &contract_id);

    let max_ts: u64 = u64::MAX;
    set_ledger_timestamp(&env, max_ts);
    client.initialize(&admin);
    client.register(&user);

    assert_eq!(client.get_timestamp(&user), max_ts);
    assert_eq!(env.ledger().timestamp(), max_ts);
}

#[test]
fn test_timestamp_ordering_across_boundaries() {
    let (env, admin, user_zero) = setup_env();
    let user_max = Address::generate(&env);
    let contract_id = env.register_contract(None, Registry);
    let client = RegistryClient::new(&env, &contract_id);

    client.initialize(&admin);

    set_ledger_timestamp(&env, 0);
    client.register(&user_zero);

    set_ledger_timestamp(&env, u64::MAX);
    client.register(&user_max);

    assert_eq!(client.get_timestamp(&user_zero), 0);
    assert_eq!(client.get_timestamp(&user_max), u64::MAX);

    // Deterministic ordering by insertion regardless of timestamp magnitude.
    let order = client.get_registration_order();
    assert_eq!(order.get(0).unwrap(), user_zero);
    assert_eq!(order.get(1).unwrap(), user_max);
}