#![cfg(test)]
//! Cost benchmark for the common registry calls (#793).
//!
//! Same approach as `contracts/oracle/src/benchmark.rs`: each call is measured with soroban's
//! budget counters (CPU instructions and memory bytes), which are deterministic for a given SDK
//! version. Run through `scripts/benchmark-contracts.mjs`, or directly with:
//!
//!   BENCH_OUTPUT=/path/to/registry.json cargo test --manifest-path contracts/registry/Cargo.toml \
//!     benchmark_most_used_calls -- --nocapture --test-threads=1

extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, BytesN, Env};
use std::{format, string::String as StdString, vec::Vec as StdVec};

/// One measured call. Names match the keys the report renderer expects.
struct Sample {
    op: &'static str,
    cpu_instructions: u64,
    memory_bytes: u64,
}

/// Resets the budget, runs `f`, and reads back what it cost.
fn measure<F: FnOnce()>(env: &Env, op: &'static str, f: F) -> Sample {
    env.budget().reset_unlimited();
    f();
    Sample {
        op,
        cpu_instructions: env.budget().cpu_instruction_cost(),
        memory_bytes: env.budget().memory_bytes_cost(),
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

#[test]
fn benchmark_most_used_calls() {
    let env = Env::default();
    env.mock_all_auths();

    let cid = env.register_contract(None, RegistryContract);
    let client = RegistryContractClient::new(&env, &cid);
    let admin = Address::generate(&env);
    let provenance = Address::generate(&env);
    client.init(&admin, &provenance);

    let tee_hash = BytesN::from_array(&env, &[1u8; 32]);
    let provider = BytesN::from_array(&env, &[2u8; 32]);

    let mut samples = StdVec::new();

    samples.push(measure(&env, "registry.add_tee_hash", || {
        client.add_tee_hash(&tee_hash);
    }));
    // Called by the oracle on every attestation, so the read path matters most.
    samples.push(measure(&env, "registry.is_tee_hash_approved", || {
        client.is_tee_hash_approved(&tee_hash);
    }));

    samples.push(measure(&env, "registry.add_provider", || {
        client.add_provider(&provider);
    }));
    samples.push(measure(&env, "registry.is_provider", || {
        client.is_provider(&provider);
    }));
    samples.push(measure(&env, "registry.is_provider_authorized", || {
        client.is_provider_authorized(&provider);
    }));

    let rotated = BytesN::from_array(&env, &[3u8; 32]);
    samples.push(measure(&env, "registry.rotate_tee_hash", || {
        client.rotate_tee_hash(&tee_hash, &rotated);
    }));

    let json = to_json(&samples);
    std::println!("{}", json);

    if let Ok(path) = std::env::var("BENCH_OUTPUT") {
        std::fs::write(&path, json).expect("failed to write BENCH_OUTPUT");
    }
}
