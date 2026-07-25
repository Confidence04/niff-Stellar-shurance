/// Admin role delegation: temporary operator grants with expiry (Issue #585).
///
/// Allows the admin to grant temporary operator roles with specific permissions
/// and an expiry ledger. Delegated operators can only perform permitted operations.
use soroban_sdk::{contractevent, Address, Env};

use crate::{
    storage,
    types::{DelegationPermissions, DelegationRecord},
    validate::Error,
};

#[contractevent(topics = ["niffyinsure", "delegation_granted"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegationGranted {
    #[topic]
    pub operator: Address,
    pub grantor: Address,
    pub expiry_ledger: u32,
    pub permissions: DelegationPermissions,
}

/// Emitted when a still-valid delegation is explicitly revoked before expiry.
///
/// Topics are indexable by both the delegate (`operator`) and the original
/// grantor (`grantor` / delegator). Payload includes the revoked permission
/// scope so off-chain indexers can update delegation state without a storage
/// round-trip.
///
/// Natural expiry (ledger advances past `expiry_ledger` with no revoke call)
/// does **not** emit this event.
#[contractevent(topics = ["niffyinsure", "delegation_revoked"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegationRevoked {
    /// Delegate whose authority was revoked.
    #[topic]
    pub operator: Address,
    /// Original grantor / delegator of the revoked authority.
    #[topic]
    pub grantor: Address,
    /// Admin who performed the early revocation.
    pub revoked_by: Address,
    /// Permission scope that was revoked.
    pub permissions: DelegationPermissions,
    pub at_ledger: u32,
}

/// Admin-only: grant a temporary delegation to `operator`.
pub fn grant_delegation(
    env: &Env,
    admin: &Address,
    operator: &Address,
    expiry_ledger: u32,
    permissions: DelegationPermissions,
) -> Result<(), Error> {
    let now = env.ledger().sequence();
    if expiry_ledger <= now {
        return Err(Error::DelegationInvalid);
    }

    let record = DelegationRecord {
        grantor: admin.clone(),
        expiry_ledger,
        permissions: permissions.clone(),
    };

    storage::set_delegation(env, operator, &record);

    DelegationGranted {
        operator: operator.clone(),
        grantor: admin.clone(),
        expiry_ledger,
        permissions,
    }
    .publish(env);

    Ok(())
}

/// Admin-only: revoke a delegation before it expires.
///
/// Emits [`DelegationRevoked`] only when a still-valid (non-expired) record is
/// removed. No-ops with no event when the operator has no record, or when the
/// stored record has already passed natural expiry (cleanup without a revoke
/// signal).
pub fn revoke_delegation(env: &Env, admin: &Address, operator: &Address) {
    let Some(record) = storage::get_delegation(env, operator) else {
        return;
    };

    let now = env.ledger().sequence();
    storage::remove_delegation(env, operator);

    // Already past natural expiry — remove stale storage but do not emit the
    // early-revocation event (indexers treat expiry as time-based, not revoke).
    if now > record.expiry_ledger {
        return;
    }

    DelegationRevoked {
        operator: operator.clone(),
        grantor: record.grantor,
        revoked_by: admin.clone(),
        permissions: record.permissions,
        at_ledger: now,
    }
    .publish(env);
}

/// Check if `operator` has a valid (non-expired) delegation.
pub fn get_delegation(env: &Env, operator: &Address) -> Option<DelegationRecord> {
    let record = storage::get_delegation(env, operator)?;
    let now = env.ledger().sequence();
    if now > record.expiry_ledger {
        return None;
    }
    Some(record)
}
