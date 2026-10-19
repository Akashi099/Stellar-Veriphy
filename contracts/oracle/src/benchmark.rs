#![cfg(test)]
//! Cost benchmark for the most-used oracle calls (#807).
//!
//! Each call is measured with soroban's budget counters (CPU instructions and memory bytes) on a
//! fresh environment, so repeated runs on the same SDK version produce identical numbers. That
//! makes a change in the output a real change in the contract, not measurement noise.
//!
//! Run through `scripts/benchmark-contracts.mjs`, or directly with:
//!
//!   BENCH_OUTPUT=/path/to/oracle.json cargo test --manifest-path contracts/oracle/Cargo.toml \
//!     benchmark_most_used_calls -- --nocapture --test-threads=1

extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, Bytes, Env};
use std::{format, string::String, vec::Vec};

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

fn to_json(samples: &[Sample]) -> String {
    let mut out = String::from("[\n");
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

    let registry = Address::generate(&env);
    let provenance = Address::generate(&env);
    let admin = Address::generate(&env);
    let cid = env.register_contract(None, OracleContract);
    let client = OracleContractClient::new(&env, &cid);
    client.init(&registry, &provenance, &admin);

    let requester = Address::generate(&env);
    let bytes = Bytes::from_array(&env, &[7u8; 32]);

    let mut samples = Vec::new();

    samples.push(measure(&env, "submit_request:normal", || {
        client.submit_request(&bytes, &bytes, &requester, &Priority::Normal);
    }));
    samples.push(measure(&env, "submit_request:high", || {
        client.submit_request(&bytes, &bytes, &requester, &Priority::High);
    }));

    // Requests created outside the measured closures so get/cancel are measured in isolation.
    let read_id = client.submit_request(&bytes, &bytes, &requester, &Priority::Normal);
    samples.push(measure(&env, "get_request", || {
        client.get_request(&read_id);
    }));

    let cancel_id = client.submit_request(&bytes, &bytes, &requester, &Priority::Normal);
    samples.push(measure(&env, "cancel_request", || {
        client.cancel_request(&cancel_id);
    }));

    let json = to_json(&samples);
    std::println!("{}", json);

    if let Ok(path) = std::env::var("BENCH_OUTPUT") {
        std::fs::write(&path, json).expect("failed to write BENCH_OUTPUT");
    }
}
