/// # Oracle Contract — Revert and failure-path tests (#805)
///
/// Each test drives one failure through the public API and asserts the exact
/// `Error` returned, so revert reasons stay explicit and stable.
use crate::{Error, OracleContract, OracleContractClient, Priority};
use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env};

fn initialised(env: &Env) -> (OracleContractClient<'_>, Address) {
    env.mock_all_auths();
    let cid = env.register_contract(None, OracleContract);
    let client = OracleContractClient::new(env, &cid);
    let registry = Address::generate(env);
    let provenance = Address::generate(env);
    let admin = Address::generate(env);
    client.init(&registry, &provenance, &admin);
    (client, admin)
}

#[test]
fn pausing_before_init_reverts_with_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register_contract(None, OracleContract);
    let client = OracleContractClient::new(&env, &cid);

    assert_eq!(client.try_pause().err(), Some(Ok(Error::NotInitialized)));
}

#[test]
fn reading_trust_for_an_unregistered_provider_reverts_with_provider_not_registered() {
    let env = Env::default();
    let (client, _) = initialised(&env);
    let stranger = Address::generate(&env);

    assert_eq!(
        client.try_get_provider_trust_score(&stranger).err(),
        Some(Ok(Error::ProviderNotRegistered))
    );
}

#[test]
fn recording_a_verification_for_an_unregistered_provider_reverts_with_provider_not_registered() {
    let env = Env::default();
    let (client, _) = initialised(&env);
    let stranger = Address::generate(&env);

    assert_eq!(
        client
            .try_record_verification(&stranger, &true, &120u32, &99u32)
            .err(),
        Some(Ok(Error::ProviderNotRegistered))
    );
}

#[test]
fn anchoring_evidence_by_a_non_party_reverts_with_unauthorized() {
    let env = Env::default();
    let (client, _) = initialised(&env);
    let content = Bytes::from_slice(&env, b"data");
    let requester = Address::generate(&env);
    let request_id = client.submit_request(&content, &content, &requester, &Priority::Normal);
    let provider = Address::generate(&env);
    let dispute_id =
        client.file_dispute(&request_id, &provider, &Bytes::from_slice(&env, b"wrong"));

    let stranger = Address::generate(&env);
    let package_hash = BytesN::from_array(&env, &[7u8; 32]);

    assert_eq!(
        client
            .try_anchor_dispute_evidence(&dispute_id, &package_hash, &stranger)
            .err(),
        Some(Ok(Error::Unauthorized))
    );
}
