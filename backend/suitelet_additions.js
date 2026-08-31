/**
 * suitelet_additions.js — dispatch blocks to add to itbs_sl_procurement_screens.js
 *
 * Paste each block alongside the existing
 *   `if (requestBody.action === smpLib.ActionType.X) { ... }`
 * blocks (same style, same place in the POST handler). They assume you have
 * already: (a) added the new methods to RestServer (classes_additions.js), and
 * (b) added the matching names to constants.ActionType.
 *
 * The `payload` variable pattern below mirrors the existing handlers that inject
 * the actor/current employee id. If your file builds `payload` via a shared
 * helper, reuse it; otherwise `requestBody.payload || {}` is fine because the
 * portal already sends currentEmployeeId / actorEmployeeId in the body.
 */

// ---- Purchase Requisition ----
if (requestBody.action === smpLib.ActionType.GET_REQUISITION_BOOTSTRAP) {
    response.write({ output: smpLib.RestServer.getRequisitionBootstrap(requestBody.payload || {}) });
    return;
}
if (requestBody.action === smpLib.ActionType.CREATE_REQUISITION_PORTAL) {
    response.write({ output: smpLib.RestServer.createRequisitionPortal(requestBody.payload || {}) });
    return;
}
if (requestBody.action === smpLib.ActionType.GET_REQUISITIONS_LIST) {
    response.write({ output: smpLib.RestServer.getRequisitionsList(requestBody.payload || {}) });
    return;
}

// ---- PO classifications (CAPEX/OPEX/WIP + budget codes) ----
if (requestBody.action === smpLib.ActionType.GET_PO_CLASSIFICATIONS) {
    response.write({ output: smpLib.RestServer.getPOClassifications(requestBody.payload || {}) });
    return;
}

// ---- Payment Request ----
if (requestBody.action === smpLib.ActionType.CREATE_PAYMENT_REQUEST_PORTAL) {
    response.write({ output: smpLib.RestServer.createPaymentRequestPortal(requestBody.payload || {}) });
    return;
}

// ---- Employee Refund ----
if (requestBody.action === smpLib.ActionType.CREATE_EMPLOYEE_REFUND_PORTAL) {
    response.write({ output: smpLib.RestServer.createEmployeeRefundPortal(requestBody.payload || {}) });
    return;
}

// ---- Vendor onboarding ----
if (requestBody.action === smpLib.ActionType.GET_VENDOR_ONBOARDING_BOOTSTRAP) {
    response.write({ output: smpLib.RestServer.getVendorOnboardingBootstrap(requestBody.payload || {}) });
    return;
}
if (requestBody.action === smpLib.ActionType.CREATE_VENDOR_REQUEST_PORTAL) {
    response.write({ output: smpLib.RestServer.createVendorRequestPortal(requestBody.payload || {}) });
    return;
}

// ---- Contract Register ----
if (requestBody.action === smpLib.ActionType.GET_CONTRACT_BOOTSTRAP) {
    response.write({ output: smpLib.RestServer.getContractBootstrap(requestBody.payload || {}) });
    return;
}
if (requestBody.action === smpLib.ActionType.GET_CONTRACTS_LIST) {
    response.write({ output: smpLib.RestServer.getContractsList(requestBody.payload || {}) });
    return;
}
if (requestBody.action === smpLib.ActionType.CREATE_CONTRACT_PORTAL) {
    response.write({ output: smpLib.RestServer.createContractPortal(requestBody.payload || {}) });
    return;
}
