/// # Registry Contract — Revert and failure-path tests (#805)
///
/// Each test drives one failure through the public API and asserts the exact
/// `Error` returned, so revert reasons stay explicit and stable.
use crate::{Error, ProposalOperation, RegistryContract, RegistryContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, BytesN, Env, String,
};

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn initialised(env: &Env) -> RegistryContractClient<'_> {
    env.mock_all_auths();
    let cid = env.register_contract(None, RegistryContract);
    let client = RegistryContractClient::new(env, &cid);
    let admin = Address::generate(env);
    let provenance = Address::generate(env);
    client.init(&admin, &provenance);
    client
}

#[test]
fn deprecating_a_hash_before_init_reverts_with_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register_contract(None, RegistryContract);
    let client = RegistryContractClient::new(&env, &cid);

    assert_eq!(
        client.try_deprecate_tee_hash(&hash(&env, 0x01)).err(),
        Some(Ok(Error::NotInitialized))
    );
}

#[test]
fn recording_a_result_before_init_reverts_with_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register_contract(None, RegistryContract);
    let client = RegistryContractClient::new(&env, &cid);

    assert_eq!(
        client
            .try_record_verification_result(&hash(&env, 0x02), &true)
            .err(),
        Some(Ok(Error::NotInitialized))
    );
}

#[test]
fn approving_an_unknown_proposal_reverts_with_proposal_not_found() {
    let env = Env::default();
    let client = initialised(&env);

    assert_eq!(
        client.try_approve_proposal(&404).err(),
        Some(Ok(Error::ProposalNotFound))
    );
}

#[test]
fn executing_without_enough_approvals_reverts_with_insufficient_approvals() {
    let env = Env::default();
    let client = initialised(&env);

    // The default multisig threshold is 1, and a fresh proposal has no approvals.
    let proposal_id = client
        .try_propose_operation(&ProposalOperation::AddTeeHash(hash(&env, 0x03)), &0)
        .unwrap()
        .unwrap();

    assert_eq!(
        client.try_execute_proposal(&proposal_id).err(),
        Some(Ok(Error::InsufficientApprovals))
    );
}

#[test]
fn executing_before_the_timelock_reverts_with_invalid_threshold() {
    // Pins the current code for a timelock that has not elapsed. The mapping to
    // InvalidThreshold is unusual, so changing it needs a deliberate decision.
    let env = Env::default();
    let client = initialised(&env);
    let proposal_id = client
        .try_propose_operation(&ProposalOperation::AddTeeHash(hash(&env, 0x04)), &100)
        .unwrap()
        .unwrap();
    client.try_approve_proposal(&proposal_id).unwrap().unwrap();

    assert_eq!(
        client.try_execute_proposal(&proposal_id).err(),
        Some(Ok(Error::InvalidThreshold))
    );
}

#[test]
fn validating_an_expired_certificate_reverts_with_certificate_expired() {
    let env = Env::default();
    let client = initialised(&env);
    let code_hash = hash(&env, 0x05);
    client.add_tee_hash(&code_hash);

    // The certificate was valid until ledger time 500, and it is now 1000.
    client
        .try_attach_cert_ref(
            &code_hash,
            &String::from_str(&env, "issuer"),
            &0u64,
            &500u64,
            &None,
        )
        .unwrap()
        .unwrap();
    env.ledger().set_timestamp(1000);

    assert_eq!(
        client.try_validate_cert_expiration(&code_hash).err(),
        Some(Ok(Error::CertificateExpired))
    );
}
