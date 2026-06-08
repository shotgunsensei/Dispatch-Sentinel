# Dispatch Sentinel - Codex Instructions

## Product Purpose

Dispatch Sentinel is an MSP automation approval and execution layer for Kaseya Datto BMS and Datto RMM.

The system reads incoming BMS tickets, classifies whether the issue is eligible for automation, matches the ticket to an approved Datto RMM component, confirms the target hostname/device with the client, then runs only approved low-risk components after confirmation.

If confidence is low, risk is high, the device is ambiguous, the component is not approved, or the request falls outside the current phase, the system must not execute automation. It must log the reason and route/escalate to human review.

## Non-Negotiable Safety Rules

1. Never generate or execute arbitrary remediation scripts.
2. Never invent Datto RMM components.
3. Never run a component unless it exists in the approved component registry.
4. Never run automation on servers unless the phase explicitly allows it and technician approval exists.
5. Never perform password resets, MFA resets, account disabling, security remediation, firewall/network policy changes, or data deletion in the MVP phases.
6. Never use AI output as the sole authority for execution.
7. Never execute automation without:
   - mapped BMS account,
   - mapped Datto RMM site,
   - matched device UID,
   - approved component registry entry,
   - valid confirmation or required approval,
   - audit log entry.
8. If uncertain, escalate to human review.
9. Each phase must remain within scope. Do not implement future-phase functionality unless explicitly requested.
10. Add tests for all decision logic.

## Architecture Principles

- BMS is the ticket/state system.
- Datto RMM is the endpoint execution system.
- Dispatch Sentinel is the approval, classification, decision, and audit layer.
- The classifier recommends. The policy engine decides.
- All actions must be auditable.
- All external API calls must be wrapped in service classes.
- Secrets must only come from environment variables or a secret provider.
- No secrets, API keys, or credentials may be committed.

## Coding Standards

- Prefer clear, boring code over clever abstractions.
- Use typed DTOs/schemas for external API payloads.
- Add input validation for all API endpoints.
- Add structured logging.
- Add unit tests for classifier and policy engine.
- Add integration-test stubs/mocks for BMS and Datto RMM.
- Include migration files for database schema changes.
- Update README and docs when behavior changes.

## MVP Automation Scope

Only these automation categories are allowed in MVP:

1. Restart print spooler.
2. Run GPUpdate.
3. Collect workstation diagnostics.
4. Clear safe temp files.
5. Restart a known user-level app process.
6. Reboot workstation only if explicitly confirmed and enabled.

Everything else must be marked human-review.

## Required Decision Outcomes

Every ticket evaluation must produce exactly one of:

- AUTO_ELIGIBLE_CONFIRM_CLIENT
- ASK_CLIENT_TO_SELECT_DEVICE
- REQUIRE_TECH_APPROVAL
- ESCALATE_TO_HUMAN
- DENY_AUTOMATION

No other execution path is allowed.

## Phase Discipline

When given a phase prompt:
- Implement only that phase.
- Do not create unrelated UI pages.
- Do not add payment systems.
- Do not add multi-tenant SaaS billing.
- Do not add AI chat.
- Do not add unrelated integrations.
- Do not rebrand the app.
- Do not rename core concepts.
- Do not skip tests.