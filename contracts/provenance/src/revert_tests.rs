/// # Provenance Contract — Revert and failure-path tests (#805)
///
/// Each test drives one failure through the public API and asserts the exact
/// `ProvenanceError` returned. Asserting the code, rather than only that a call
/// failed, keeps revert reasons explicit and stops them drifting silently.
extern crate std;
use std::format;
use std::string::ToString;

use crate::{
    ContentType, ProvenanceContract, ProvenanceContractClient, ProvenanceError, RevocationReason,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

fn setup(env: &Env) -> (ProvenanceContractClient<'_>, Address) {
    env.mock_all_auths();
    let cid = env.register_contract(None, ProvenanceContract);
    let oracle = Address::generate(env);
    let client = ProvenanceContractClient::new(env, &cid);
    client.initialize(&oracle);
    (client, oracle)
}

fn mint(env: &Env, client: &ProvenanceContractClient, suffix: &str, owner: &Address) -> u64 {
    client.mint(
        &String::from_str(env, &format!("ipfs://Qm{suffix}")),
        &String::from_str(env, &format!("manifest_{suffix}")),
        &String::from_str(env, &format!("attestation_{suffix}")),
        owner,
    )
}

// -----------------------------------------------------------------------
// Lifecycle: revoke and lock
// -----------------------------------------------------------------------

#[test]
fn revoking_twice_reverts_with_already_revoked() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "twice", &owner);

    client.revoke_certificate(&id, &RevocationReason::LegalRequirement);

    assert_eq!(
        client.try_revoke_certificate(&id, &RevocationReason::CreatorRequest),
        Err(Ok(ProvenanceError::AlreadyRevoked))
    );
}

#[test]
fn revoking_a_locked_certificate_reverts_with_certificate_locked() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "locked-revoke", &owner);

    client.lock_certificate(&id);

    assert_eq!(
        client.try_revoke_certificate(&id, &RevocationReason::FraudulentContent),
        Err(Ok(ProvenanceError::CertificateLocked))
    );
}

#[test]
fn transferring_a_locked_certificate_reverts_with_certificate_locked() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "locked-xfer", &owner);

    client.lock_certificate(&id);

    let next = Address::generate(&env);
    assert_eq!(
        client.try_transfer_certificate(&id, &next),
        Err(Ok(ProvenanceError::CertificateLocked))
    );
}

#[test]
fn unknown_certificate_reverts_with_certificate_not_found() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(
        client.try_get_certificate(&999).err(),
        Some(Ok(ProvenanceError::CertificateNotFound))
    );
}

// -----------------------------------------------------------------------
// Verification codes
// -----------------------------------------------------------------------

#[test]
fn unknown_verification_code_reverts_with_code_not_found() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(
        client
            .try_verify_by_code(&String::from_str(&env, "NO-SUCH-CODE"))
            .err(),
        Some(Ok(ProvenanceError::CodeNotFound))
    );
}

// -----------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------

#[test]
fn tag_longer_than_the_limit_reverts_with_invalid_tag_length() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "long-tag", &owner);

    let too_long = "t".repeat(51);
    assert_eq!(
        client.try_add_tag(&id, &String::from_str(&env, &too_long)),
        Err(Ok(ProvenanceError::InvalidTagLength))
    );
}

#[test]
fn adding_a_twenty_first_tag_reverts_with_max_tags_exceeded() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "many-tags", &owner);

    for i in 0..20 {
        client.add_tag(&id, &String::from_str(&env, &format!("tag-{i}")));
    }

    assert_eq!(
        client.try_add_tag(&id, &String::from_str(&env, "one-too-many")),
        Err(Ok(ProvenanceError::MaxTagsExceeded))
    );
}

#[test]
fn replacing_tags_with_too_many_reverts_with_max_tags_exceeded() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "set-many", &owner);

    let mut tags: Vec<String> = Vec::new(&env);
    for i in 0..21 {
        tags.push_back(String::from_str(&env, &format!("tag-{i}")));
    }

    assert_eq!(
        client.try_set_tags(&id, &tags),
        Err(Ok(ProvenanceError::MaxTagsExceeded))
    );
}

#[test]
fn replacing_tags_with_an_overlong_tag_reverts_with_invalid_tag_length() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "set-long", &owner);

    let mut tags: Vec<String> = Vec::new(&env);
    tags.push_back(String::from_str(&env, &"t".repeat(51)));

    assert_eq!(
        client.try_set_tags(&id, &tags),
        Err(Ok(ProvenanceError::InvalidTagLength))
    );
}

#[test]
fn tagging_a_locked_certificate_reverts_with_certificate_locked() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "locked-tag", &owner);

    client.lock_certificate(&id);

    assert_eq!(
        client.try_add_tag(&id, &String::from_str(&env, "late")),
        Err(Ok(ProvenanceError::CertificateLocked))
    );
}

// -----------------------------------------------------------------------
// Collections
// -----------------------------------------------------------------------

#[test]
fn reading_a_missing_collection_reverts_with_collection_not_found() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(
        client.try_get_collection(&404).err(),
        Some(Ok(ProvenanceError::CollectionNotFound))
    );
}

#[test]
fn adding_to_a_missing_collection_reverts_with_collection_not_found() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "no-coll", &owner);

    assert_eq!(
        client.try_add_certificate_to_collection(&404, &id),
        Err(Ok(ProvenanceError::CollectionNotFound))
    );
}

// -----------------------------------------------------------------------
// Media metadata and redaction
// -----------------------------------------------------------------------

#[test]
fn empty_mime_type_reverts_with_invalid_media_metadata() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "no-mime", &owner);

    let result = client.try_set_media_properties(
        &id,
        &ContentType::Image,
        &String::from_str(&env, ""),
        &None,
        &None,
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ProvenanceError::InvalidMediaMetadata)));
}

#[test]
fn redaction_policy_from_a_stranger_reverts_with_unauthorized() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    let id = mint(&env, &client, "redact", &owner);
    let stranger = Address::generate(&env);

    assert_eq!(
        client.try_set_redaction_policy(&id, &String::from_str(&env, "policy-hash"), &stranger),
        Err(Ok(ProvenanceError::Unauthorized))
    );
}
