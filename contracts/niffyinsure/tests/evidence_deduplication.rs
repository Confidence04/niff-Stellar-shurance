#![cfg(test)]

use niffyinsure::{validate::Error, NiffyInsureClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

mod common;
use common::{non_zero_hash, sample_digest};

fn setup() -> (Env, NiffyInsureClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(niffyinsure::NiffyInsure, ());
    let client = NiffyInsureClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    client.initialize(&admin, &token);
    (env, client, admin, token)
}

fn file(
    env: &Env,
    client: &NiffyInsureClient,
    holder: &Address,
    evidence: Vec<niffyinsure::types::ClaimEvidenceEntry>,
) -> Result<u64, Error> {
    client.try_file_claim(
        holder,
        &1u32,
        &100_000i128,
        &String::from_str(env, "test claim"),
        &evidence,
        &None,
    )
}

#[test]
fn unique_evidence_entries_accepted() {
    let (env, client, _, _) = setup();
    let holder = Address::generate(&env);
    client.test_seed_policy(&holder, &1u32, &1_000_000i128, &999_999u32);

    let mut evidence = Vec::new(&env);
    evidence.push_back(niffyinsure::types::ClaimEvidenceEntry {
        url: String::from_str(&env, "ipfs://hash1"),
        hash: non_zero_hash(&env),
    });
    evidence.push_back(niffyinsure::types::ClaimEvidenceEntry {
        url: String::from_str(&env, "ipfs://hash2"),
        hash: sample_digest(&env),
    });

    assert!(file(&env, &client, &holder, evidence).is_ok());
}

#[test]
fn duplicate_url_and_hash_reverts_with_duplicate_evidence() {
    let (env, client, _, _) = setup();
    let holder = Address::generate(&env);
    client.test_seed_policy(&holder, &1u32, &1_000_000i128, &999_999u32);

    let entry = niffyinsure::types::ClaimEvidenceEntry {
        url: String::from_str(&env, "ipfs://samehash"),
        hash: non_zero_hash(&env),
    };
    let mut evidence = Vec::new(&env);
    evidence.push_back(entry.clone());
    evidence.push_back(entry);

    let result = file(&env, &client, &holder, evidence);
    assert_eq!(result.unwrap_err(), Error::DuplicateEvidence);
}

#[test]
fn same_url_different_hash_is_allowed() {
    let (env, client, _, _) = setup();
    let holder = Address::generate(&env);
    client.test_seed_policy(&holder, &1u32, &1_000_000i128, &999_999u32);

    let mut hash_a = [0u8; 32];
    hash_a[0] = 1;
    let mut hash_b = [0u8; 32];
    hash_b[0] = 2;

    let mut evidence = Vec::new(&env);
    evidence.push_back(niffyinsure::types::ClaimEvidenceEntry {
        url: String::from_str(&env, "ipfs://same-url"),
        hash: BytesN::from_array(&env, &hash_a),
    });
    evidence.push_back(niffyinsure::types::ClaimEvidenceEntry {
        url: String::from_str(&env, "ipfs://same-url"),
        hash: BytesN::from_array(&env, &hash_b),
    });

    assert!(file(&env, &client, &holder, evidence).is_ok());
}
