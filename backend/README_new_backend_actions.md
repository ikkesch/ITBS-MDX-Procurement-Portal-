# Atlas Procurement — new P2P screens: backend wiring & caveats

This round added the remaining procure-to-pay screens (BRD lines 4–8) to the
portal. Three of them use **existing, tested** backend actions; the rest use
**new** actions I've written but **could not run against the live MDX account**.
This note is the contract + the things to confirm before go-live.

## What's fully wired to existing, tested backend
| Screen | Actions used |
|---|---|
| New PO → **budget check** (FR-203) | `GET_PO_BUDGET_CHECK` |
| **Receive items / GRN** | `GET_PO_RECEIVING_LIST`, `GET_PO_RECEIVING_DETAIL`, `CREATE_ITEM_RECEIPT_FROM_PO` |
| **New expense report** (petty cash / credit card) | `GET_EXPENSE_REPORT_CREATE_BOOTSTRAP`, `CREATE_EXPENSE_REPORT_PORTAL` |

## What needs the NEW backend (from `classes_additions.js` + `suitelet_additions.js`)
| Screen | New action(s) | BRD |
|---|---|---|
| Requisitions list + New requisition | `GET_REQUISITIONS_LIST`, `GET_REQUISITION_BOOTSTRAP`, `CREATE_REQUISITION_PORTAL` | line 4 / FR-150–154 |
| PO CAPEX/OPEX/WIP + budget code | `GET_PO_CLASSIFICATIONS` (+ 3 setValue lines in `createPurchaseOrderPortal`) | line 5 / FR-201 |
| Payment Requests + modes + part-pay | `CREATE_PAYMENT_REQUEST_PORTAL` (reuses `createVendorBillPortal`) | line 7 / FR-401/402 |
| Employee refund | `CREATE_EMPLOYEE_REFUND_PORTAL` (reuses `createExpenseReportPortal`) | line 7 / FR-403 |
| Vendor onboarding request | `GET_VENDOR_ONBOARDING_BOOTSTRAP`, `CREATE_VENDOR_REQUEST_PORTAL` | line 6 / FR-301, 304 |
| Contract Register list + New contract | `GET_CONTRACT_BOOTSTRAP`, `GET_CONTRACTS_LIST`, `CREATE_CONTRACT_PORTAL` | line 6 / FR-303 |

## Install order
1. Add the new **method bodies** into `class RestServer { … }` in `classes.js` (from [`classes_additions.js`](./classes_additions.js), in this directory). Syntax-validated in a class shell.
2. Add the new names to **`constants.ActionType`** (value === key string, e.g. `GET_REQUISITIONS_LIST: 'GET_REQUISITIONS_LIST'`).
3. Add the **dispatch blocks** to `itbs_sl_procurement_screens.js` (from [`suitelet_additions.js`](./suitelet_additions.js), in this directory).
4. Add the 3 `setValue` lines to `createPurchaseOrderPortal` (marked in `classes_additions.js`) so the PO stores expenditure type / budget code / override reason.
5. Upload [`../frontend/Atlas_Procurement_Portal.html`](../frontend/Atlas_Procurement_Portal.html) over the served File Cabinet copy.

Note: `classes.js` and `itbs_sl_procurement_screens.js` themselves are not part of this repo — they live in the MDX NetSuite account's SDF project. The two files above are patches to paste into them.

## `TODO(confirm)` — account-specific ids the new code assumes
These are wrapped in `try/catch`, so a wrong id won't crash a save — the value is just skipped. But confirm them or the data won't persist:

- **PO classification** custom list ids: `customlist_itbs_exp_type`, `customlist_itbs_bud_code`; body fields `custbody_itbs_exp_type`, `custbody_itbs_bud_code`, `custbody_itbs_budget_override_reason`. (If budget "codes" are records rather than a list, adapt `getPOClassifications` to search that record.)
- **Payment request** body fields: `custbody_itbs_pay_mode`, `custbody_itbs_part_payment`, `custbody_itbs_part_pay_amount`, `custbody_itbs_dd_invoice_no`, `custbody_itbs_dd_invoice_date`, `custbody_itbs_dd_amount`.
- **Employee refund** flag: `custbody_itbs_is_refund` (optional).
- **Vendor onboarding**: BRN field `custentity_itbs_brn`; bank fields `custentity_itbs_bank_name/_acct/_swift`, `custentity_itbs_intl_bank`; approval flag `custentity_itbs_approval_status` (and its "Pending" value). TDS uses the existing `custentity_itbs_tds` / `custentity_itbs_tds_rate`. TDS-rate list id `customlist_itbs_tds_rate`.
- **Contract Register**: record `customrecord_itbs_contract` with fields `custrecord_itbs_ct_vendor/_start/_end/_value/_status/_notes`, and status list `customlist_itbs_ctr_stat`. (The list/register exist in the SDF package; confirm the exact field script-ids — the `ct_*` names here are my best mapping.)

## Things that are genuinely out of the portal's reach (still open per BRD)
- **Contract expiry alerts (30/60/90 days, FR-303)** — a **Scheduled Script**, not a portal action. Needs to be written + deployed separately.
- **Vendor approval routing (FR-301)** — the create sets a pending flag; the actual review/approve workflow is a **SuiteFlow** (or a portal approval queue) that still needs building.
- **Payment modes downstream** — the portal now *captures* bank/petty-cash/credit-card/direct-debit and part-payment intent on the bill; how each mode is then *processed* (e.g. credit-card record-and-reconcile, direct-debit handling) is Finance-process/config work.
- **Bank Payments & Signatory (FR-500) and Reconciliation (FR-600)** — separate from lines 4–8; not in this round.

## Honesty note
The new SuiteScript follows the existing patterns in `classes.js` and reuses its
helpers, and the method bodies pass a syntax check. But it has **not** executed
against NetSuite, and several writes depend on the `TODO(confirm)` ids above.
Treat it as a reviewed first cut to test in the sandbox, not a guaranteed-clean
production drop. The **portal front-end** for every screen is verified end-to-end
in a headless browser (correct payload shapes, no console errors).
