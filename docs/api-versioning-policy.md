# API Versioning Policy

## Overview

This document defines how public surfaces (REST, GraphQL, and contract
entrypoints) are versioned, and how that versioning interacts with removals.

## Versioning Scheme

- REST/GraphQL API: semantic versioning at the service level (`MAJOR.MINOR.PATCH`).
  Breaking changes require a `MAJOR` bump.
- Contract (Soroban): WASM builds are tagged per release; a breaking change to
  a public entrypoint requires a new major contract version.

## Removals

No public REST/GraphQL field or contract entrypoint may be removed without
first going through the deprecation process, including the minimum notice
period and announcement mechanism, defined in the
[API deprecation policy](./api-deprecation-policy.md). A `MAJOR` version bump
must reference the corresponding deprecation announcement(s) in its changelog
entry.
