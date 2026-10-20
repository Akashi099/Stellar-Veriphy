#![cfg(test)]
//! Cost benchmark for the common provenance calls (#793).
//!
//! Same approach as `contracts/oracle/src/benchmark.rs`: each call is measured with soroban's
//! budget counters (CPU instructions and memory bytes), which are deterministic for a given SDK
//! version. Run through `scripts/benchmark-contracts.mjs`, or directly with:
//!
//!   BENCH_OUTPUT=/path/to/provenance.json cargo test --manifest-path contracts/provenance/Cargo.toml \
//!     benchmark_most_used_calls -- --nocapture --test-threads=1

extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String, Vec};
use std::{format, string::String as StdString, vec::Vec as StdVec};

/// One measured call. Names match the keys the report renderer expects.
struct Sample {
    op: &'static str,
    cpu_instructions: u64,
    memory_bytes: u64,
}

/// Resets the budget, runs `f`, and reads back what it cost.
fn measure<F: FnOnce()>(env: &Env, op: &'static str, f: F) -> Sample {
    env.cost_estimate().budget().reset_unlimited();
    f();
    Sample {
        op,
        cpu_instructions: env.cost_estimate().budget().cpu_instruction_cost(),
        memory_bytes: env.cost_estimate().budget().memory_bytes_cost(),
    }
}

fn to_json(samples: &[Sample]) -> StdString {
    let mut out = StdString::from("[\n");
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

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

#[test]
fn benchmark_most_used_calls() {
    let env = Env::default();
    env.mock_all_auths();

    let cid = env.register_contract(None, ProvenanceContract);
    let client = ProvenanceContractClient::new(&env, &cid);
    let oracle = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    client.init(&oracle);

    let mut samples = StdVec::new();

    samples.push(measure(&env, "provenance.mint", || {
        client.mint(&s(&env, "ipfs://bench"), &s(&env, "mhash-bench-0"), &s(&env, "ahash"), &owner);
    }));

    // Batch of 5 so the per-item cost can be compared with single mints.
    let mut refs = Vec::new(&env);
    let mut manifests = Vec::new(&env);
    let mut attestations = Vec::new(&env);
    for i in 0..5 {
        refs.push_back(s(&env, "ipfs://bench-batch"));
        manifests.push_back(s(&env, &format!("mhash-batch-{}", i)));
        attestations.push_back(s(&env, "ahash"));
    }
    samples.push(measure(&env, "provenance.mint_batch:5", || {
        client.mint_batch(&refs, &manifests, &attestations, &owner);
    }));

    // Certificates created outside the measured closures so each call is measured in isolation.
    let read_id = client.mint(&s(&env, "ipfs://r"), &s(&env, "mhash-read"), &s(&env, "ahash"), &owner);
    samples.push(measure(&env, "provenance.get_certificate", || {
        client.get_certificate(&read_id);
    }));

    let transfer_id =
        client.mint(&s(&env, "ipfs://t"), &s(&env, "mhash-transfer"), &s(&env, "ahash"), &owner);
    samples.push(measure(&env, "provenance.transfer_certificate", || {
        client.transfer_certificate(&transfer_id, &new_owner);
    }));

    let revoke_id =
        client.mint(&s(&env, "ipfs://v"), &s(&env, "mhash-revoke"), &s(&env, "ahash"), &owner);
    samples.push(measure(&env, "provenance.revoke_certificate", || {
        client.revoke_certificate(&revoke_id, &RevocationReason::CreatorRequest);
    }));

    let level_id =
        client.mint(&s(&env, "ipfs://l"), &s(&env, "mhash-level"), &s(&env, "ahash"), &owner);
    samples.push(measure(&env, "provenance.set_verification_level", || {
        client.set_verification_level(&level_id, &VerificationLevel::Standard);
    }));

    let tag_id = client.mint(&s(&env, "ipfs://g"), &s(&env, "mhash-tag"), &s(&env, "ahash"), &owner);
    samples.push(measure(&env, "provenance.add_tag", || {
        client.add_tag(&tag_id, &s(&env, "news"));
    }));

    let json = to_json(&samples);
    std::println!("{}", json);

    if let Ok(path) = std::env::var("BENCH_OUTPUT") {
        std::fs::write(&path, json).expect("failed to write BENCH_OUTPUT");
    }
}
