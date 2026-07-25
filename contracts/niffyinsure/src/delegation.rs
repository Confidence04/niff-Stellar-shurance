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

/// Emitted when a delegation is **explicitly revoked** before natural expiry.
/// Natural expiry (ledger past `expiry_ledger`) does **not** emit this event —
/// off-chain indexers should treat a missing/expired record as inactive without
/// waiting for a revoke event.
#[contractevent(topics = ["niffyinsure", "delegation_revoked"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegationRevoked {
    /// The delegate whose authority was revoked.
    #[topic]
    pub operator: Address,
    /// The original grantor (delegator) of the revoked authority.
    pub delegator: Address,
    /// The admin who performed the explicit revocation.
    pub revoked_by: Address,
    /// The permission scope that was revoked (for indexer state updates).
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
/// Emits [`DelegationRevoked`] with the delegator, delegate, and revoked scope
/// so indexers can update delegation state. No event is emitted when there is
/// no stored record (idempotent no-op).
pub fn revoke_delegation(env: &Env, admin: &Address, operator: &Address) {
    let Some(record) = storage::get_delegation(env, operator) else {
        return;
    };

    storage::remove_delegation(env, operator);

    DelegationRevoked {
        operator: operator.clone(),
        delegator: record.grantor,
        revoked_by: admin.clone(),
        permissions: record.permissions,
        at_ledger: env.ledger().sequence(),
    }
    .publish(env);
}

/// Check if `operator` has a valid (non-expired) delegation.
///
/// Natural expiry is silent: when `now > expiry_ledger` this returns `None`
/// without emitting [`DelegationRevoked`].
pub fn get_delegation(env: &Env, operator: &Address) -> Option<DelegationRecord> {
    let record = storage::get_delegation(env, operator)?;
    let now = env.ledger().sequence();
    if now > record.expiry_ledger {
        return None;
    }
    Some(record)
}
