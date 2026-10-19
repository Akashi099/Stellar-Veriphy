//! Smoke tests for the oracle contract.
//!
//! Each test walks one core verification-request flow end to end on a local
//! Soroban environment. They are named `smoke_*` so `cargo test smoke_` (or
//! `scripts/contracts-smoke.sh`) runs only this suite.

use crate::{Error, OracleContract, OracleContractClient, Priority, RequestState};
use soroban_sdk::{testutils::Address as _, Address, Bytes, Env};

fn setup(env: &Env) -> OracleContractClient<'_> {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, OracleContract);
    let client = OracleContractClient::new(env, &contract_id);
    let registry = Address::generate(env);
    let provenance = Address::generate(env);
    let admin = Address::generate(env);
    client.init(&registry, &provenance, &admin);
    client
}

fn submit(env: &Env, client: &OracleContractClient, requester: &Address) -> u64 {
    client.submit_request(
        &Bytes::from_slice(env, b"ipfs://smoke"),
        &Bytes::from_slice(env, b"manifest-smoke"),
        requester,
        &Priority::Normal,
    )
}

#[test]
fn smoke_submitted_request_is_pending() {
    let env = Env::default();
    let client = setup(&env);
    let requester = Address::generate(&env);

    let id = submit(&env, &client, &requester);

    let request = client
        .get_request(&id)
        .expect("a submitted request must be readable by its id");
    assert_eq!(request.state, RequestState::Pending);
    assert_eq!(request.requester, requester);
}

#[test]
fn smoke_cancel_pending_request_then_reject_second_cancel() {
    let env = Env::default();
    let client = setup(&env);
    let requester = Address::generate(&env);
    let id = submit(&env, &client, &requester);

    client.cancel_request(&id);
    assert_eq!(
        client
            .get_request(&id)
            .expect("request still readable")
            .state,
        RequestState::Cancelled,
    );

    let err = client
        .try_cancel_request(&id)
        .expect_err("a cancelled request must not cancel again")
        .expect("expected a contract error, not a host error");
    assert_eq!(err, Error::InvalidState);
}

#[test]
fn smoke_pause_blocks_submissions_until_unpaused() {
    let env = Env::default();
    let client = setup(&env);
    let requester = Address::generate(&env);

    client.pause();
    assert!(client.is_paused());
    assert!(
        client
            .try_submit_request(
                &Bytes::from_slice(&env, b"ipfs://paused"),
                &Bytes::from_slice(&env, b"manifest-paused"),
                &requester,
                &Priority::Normal,
            )
            .is_err(),
        "submissions must be rejected while paused"
    );

    client.unpause();
    assert!(!client.is_paused());
    submit(&env, &client, &requester);
}

#[test]
fn smoke_second_init_is_rejected() {
    let env = Env::default();
    let client = setup(&env);

    let err = client
        .try_init(
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
        )
        .expect_err("re-initialising must fail")
        .expect("expected a contract error, not a host error");
    assert_eq!(err, Error::AlreadyInitialized);
}
