# WiVoTe Zero-Trust Security Specification (TDD)

## 1. Data Invariants
1. **Workspace Boundary:** Users, Vouchers, Requests, Cash Drops, and Legacy Devices must belong to a valid workspace. Access is governed by workspace membership.
2. **Agent Isolation:** Field Agents can only access and query vouchers where `assignedAgentId == request.auth.uid`.
3. **Role Lock:** Field Agents cannot self-escalate or change their role to `WorkspaceMaster` or `AppOwner`.
4. **App Owner Gateway:** App Owner workspace is accessible only by authorized emails (`karimazondomike049@gmail.com`).

## 2. The "Dirty Dozen" Payloads (Exploit Attempts)
These payloads are mathematically designed to break the laws of Identity, Integrity, and State, and MUST return `PERMISSION_DENIED`:

1. **Self-Escalation:** An Agent attempts to update their own profile `role` field to `'WorkspaceMaster'`.
2. **Cross-Tenant Voucher Read:** An Agent in Workspace A attempts to read vouchers belonging to Workspace B.
3. **Foreign Voucher Assignment:** An Agent attempts to assign a voucher to themselves by writing to the `assignedAgentId` field.
4. **Blanket Voucher Scrape:** An Agent tries to run a blanket read query on all vouchers without filtering by `assignedAgentId`.
5. **Unauthorized Legacy Approval:** An Agent attempts to approve a legacy device enrollment by setting `isApproved: true` on the payload.
6. **Self-Approved Cash Drop:** An Agent attempts to set status `GREEN/Reconciled` on their own cash drop ledger entry without Administrator confirmation.
7. **Orphaned Voucher Creation:** Unauthenticated user attempts to create a voucher outside any valid workspace.
8. **App Owner Spoofing:** A user with email `spoofed_owner@gmail.com` attempts to write to the `saas_config` collection.
9. **Junk Character ID Injection:** An attacker attempts to write to `/workspaces/WORKSPACE_ID/vouchers/JUNK_CHARACTERS_1.5KB_LONG_STRING` to cause denial of wallet.
10. **Immutable Field Tampering:** An Agent attempts to alter `createdAt` or `originalOwnerId` on a confirmed voucher.
11. **Future Timestamp Spoofing:** A client attempts to set a custom future timestamp for `soldAt` instead of `request.time`.
12. **PII Blanket Leak:** A random authenticated user attempts to run a blanket read on `/users` collection to scrape email and phone directories.

## 3. Security Spec Execution
All "Dirty Dozen" exploits will be synchronously blocked by the Zero-Trust `firestore.rules`.
