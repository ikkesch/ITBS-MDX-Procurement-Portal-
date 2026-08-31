/**
 * ============================================================================
 * classes_additions.js  —  NEW RestServer methods for the Atlas Procurement
 * portal (Purchase Requisition, PO classifications, Payment Request, Employee
 * Refund, Vendor onboarding, Contract Register).
 *
 * HOW TO INSTALL
 *   Paste each `static <name> = ...` method INSIDE the `class RestServer { ... }`
 *   block in classes.js (e.g. just before `getPOHeaderExtras`). They reuse the
 *   helpers already defined in that module scope: formatResponse, constants,
 *   getAllRowsFromSearch, isOneWorld, recordTypeExists, parsePortalDate,
 *   toNumber, resolveCurrencyText, PORTAL_CREATED_FIELD, etc. Then add the
 *   Suitelet dispatch blocks from suitelet_additions.js.
 *
 * IMPORTANT — this is NEW, UNTESTED SuiteScript. It could not be run against the
 * live MDX account. Every account-specific field id / custom record / custom
 * list is marked `TODO(confirm)` below. Confirm those exist (or adjust) before
 * relying on it. All record writes are wrapped so a missing OPTIONAL custom
 * field is skipped rather than failing the save; a missing REQUIRED custom
 * record (contracts / vendor-request status) fails soft with a clear message.
 * ============================================================================
 */

/* ------------------------------------------------------------------ *
 * 1) PURCHASE REQUISITION  (BRD line 4 / FR-150–154)
 * ------------------------------------------------------------------ */

// Reuses the same item/department/location scoping as the PO create bootstrap.
static getRequisitionBootstrap = (payload = {}) => {
  const title = 'getRequisitionBootstrap :: ';
  try {
    // The PO create bootstrap already returns items (dept-scoped), departments,
    // locations, currencies, currentEmployee. Requisitions need the same set,
    // minus vendor currency. Reuse it and pass through.
    const poBoot = JSON.parse(this.getPOCreateBootstrap(payload) || '{}');
    const d = poBoot.data || {};
    return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, {
      currentEmployee: d.currentEmployee || {},
      items: d.items || [],
      departments: d.departments || [],
      locations: d.locations || [],
      currencies: d.currencies || [],
      subsidiaries: d.subsidiaries || []
    }, 'Ok!');
  } catch (e) {
    log.error({ title: title + 'error', details: e });
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, e.message || 'Error loading requisition bootstrap.');
  }
};

static createRequisitionPortal = (payload = {}) => {
  const title = 'createRequisitionPortal :: ';
  try {
    const header = payload.header || {};
    const lines = (payload.lines || []).filter(l => l && l.itemId && this.toNumber(l.quantity) > 0);
    if (!lines.length) {
      return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, 'Please add at least one item line.');
    }
    const reqRec = record.create({ type: record.Type.PURCHASE_REQUISITION, isDynamic: true });
    // Requestor: employee entity on the requisition (native field is 'entity').
    if (header.employeeId) { try { reqRec.setValue({ fieldId: 'entity', value: Number(header.employeeId) }); } catch (e) {} }
    if (header.subsidiaryId && isOneWorld()) { try { reqRec.setValue({ fieldId: 'subsidiary', value: Number(header.subsidiaryId) }); } catch (e) {} }
    if (header.tranDate) { try { reqRec.setValue({ fieldId: 'trandate', value: this.parsePortalDate(header.tranDate) }); } catch (e) {} }
    if (header.memo) { try { reqRec.setValue({ fieldId: 'memo', value: String(header.memo) }); } catch (e) {} }
    if (header.departmentId) { try { reqRec.setValue({ fieldId: 'department', value: Number(header.departmentId) }); } catch (e) {} }
    if (header.locationId) { try { reqRec.setValue({ fieldId: 'location', value: Number(header.locationId) }); } catch (e) {} }
    try { reqRec.setValue({ fieldId: this.PORTAL_CREATED_FIELD, value: true }); } catch (e) {}

    lines.forEach((l) => {
      reqRec.selectNewLine({ sublistId: 'item' });
      reqRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: Number(l.itemId) });
      reqRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: this.toNumber(l.quantity) || 1 });
      if (this.toNumber(l.rate)) { try { reqRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: this.toNumber(l.rate) }); } catch (e) {} }
      if (l.departmentId) { try { reqRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'department', value: Number(l.departmentId) }); } catch (e) {} }
      reqRec.commitLine({ sublistId: 'item' });
    });

    const id = reqRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
    const look = search.lookupFields({ type: search.Type.PURCHASE_REQUISITION, id, columns: ['tranid'] });
    return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, { id, tranId: look.tranid || String(id) }, 'Requisition created.');
  } catch (e) {
    log.error({ title: title + 'error', details: e });
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, e.message || 'Error creating requisition.');
  }
};

static getRequisitionsList = (payload = {}) => {
  const title = 'getRequisitionsList :: ';
  try {
    const rows = getAllRowsFromSearch(search.create({
      type: search.Type.PURCHASE_REQUISITION,
      filters: [['mainline', 'is', 'T']],
      columns: [
        search.createColumn({ name: 'internalid' }),
        search.createColumn({ name: 'tranid' }),
        search.createColumn({ name: 'trandate', sort: search.Sort.DESC }),
        search.createColumn({ name: 'entity' }),
        search.createColumn({ name: 'department' }),
        search.createColumn({ name: 'amount' }),
        search.createColumn({ name: 'statusref' })
      ]
    })) || [];
    const requisitions = rows.map(r => ({
      id: r.getValue({ name: 'internalid' }),
      tranId: r.getValue({ name: 'tranid' }),
      dateISO: this.toISODateString(r.getValue({ name: 'trandate' })),
      employeeName: r.getText({ name: 'entity' }) || '',
      departmentText: r.getText({ name: 'department' }) || '',
      amount: this.toNumber(r.getValue({ name: 'amount' })),
      status: r.getText({ name: 'statusref' }) || ''
    }));
    return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, { requisitions }, 'Ok!');
  } catch (e) {
    log.error({ title: title + 'error', details: e });
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, e.message || 'Error loading requisitions.');
  }
};

/* ------------------------------------------------------------------ *
 * 2) PO CLASSIFICATIONS — CAPEX/OPEX/WIP + budget codes (BRD line 5 / FR-201)
 * ------------------------------------------------------------------ */
static getPOClassifications = (payload = {}) => {
  const title = 'getPOClassifications :: ';
  const listOptions = (listId) => {
    try {
      return (getAllRowsFromSearch(search.create({
        type: listId,
        columns: [search.createColumn({ name: 'internalid' }), search.createColumn({ name: 'name' })]
      })) || []).map(r => ({ value: r.getValue({ name: 'internalid' }), text: r.getValue({ name: 'name' }) }));
    } catch (e) { log.audit({ title: title + listId, details: (e && e.message) || e }); return []; }
  };
  // TODO(confirm) custom list ids in the MDX account:
  const expenditureTypes = listOptions('customlist_itbs_exp_type');   // CAPEX / OPEX / WIP / Income / Other
  const budgetCodes      = listOptions('customlist_itbs_bud_code');   // if budget codes are a list; else adapt to a search of budget records
  return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, { expenditureTypes, budgetCodes }, 'Ok!');
};
// NOTE: to persist the choices, add these two lines inside createPurchaseOrderPortal
// AFTER the header is set (see suitelet_additions.js note):
//   if (payload.header && payload.header.expenditureType) { try { poRec.setValue({ fieldId: 'custbody_itbs_exp_type', value: Number(payload.header.expenditureType) }); } catch(e){} }
//   if (payload.header && payload.header.budgetCode)      { try { poRec.setValue({ fieldId: 'custbody_itbs_bud_code', value: Number(payload.header.budgetCode) }); } catch(e){} }
//   if (payload.header && payload.header.budgetOverrideReason) { try { poRec.setValue({ fieldId: 'custbody_itbs_budget_override_reason', value: String(payload.header.budgetOverrideReason) }); } catch(e){} }

/* ------------------------------------------------------------------ *
 * 3) PAYMENT REQUEST (BRD line 7 / FR-401/402) — creates the AP invoice
 *    (vendor bill) and stamps the payment mode + part-payment intent.
 *    Delegates the actual bill creation to the existing createVendorBillPortal
 *    so the two paths (from-PO / standalone) stay identical, then stamps extras.
 * ------------------------------------------------------------------ */
static createPaymentRequestPortal = (payload = {}) => {
  const title = 'createPaymentRequestPortal :: ';
  try {
    // Reuse the proven vendor-bill creation. It already validates referenceNo,
    // vendor/PO, and builds item/expense lines.
    const billResp = JSON.parse(this.createVendorBillPortal(payload) || '{}');
    if (String(billResp.status) !== '200' || !billResp.data) return JSON.stringify(billResp);
    const billId = billResp.data.id;
    // Stamp payment-request extras on the created bill (all optional custom fields).
    try {
      const rec = record.load({ type: record.Type.VENDOR_BILL, id: billId, isDynamic: false });
      let dirty = false;
      // TODO(confirm) custom field ids:
      if (payload.paymentMode)          { try { rec.setValue({ fieldId: 'custbody_itbs_pay_mode', value: String(payload.paymentMode) }); dirty = true; } catch (e) {} }
      if (payload.partPayment && payload.partPayment.isPartial) {
        try { rec.setValue({ fieldId: 'custbody_itbs_part_payment', value: true }); dirty = true; } catch (e) {}
        try { rec.setValue({ fieldId: 'custbody_itbs_part_pay_amount', value: this.toNumber(payload.partPayment.amount) }); dirty = true; } catch (e) {}
      }
      if (payload.paymentMode === 'direct_debit' && payload.directDebit) {
        try { rec.setValue({ fieldId: 'custbody_itbs_dd_invoice_no',   value: String(payload.directDebit.invoiceNo || '') }); dirty = true; } catch (e) {}
        try { rec.setValue({ fieldId: 'custbody_itbs_dd_invoice_date', value: this.parsePortalDate(payload.directDebit.invoiceDate) }); dirty = true; } catch (e) {}
        try { rec.setValue({ fieldId: 'custbody_itbs_dd_amount',       value: this.toNumber(payload.directDebit.amount) }); dirty = true; } catch (e) {}
      }
      if (dirty) rec.save({ ignoreMandatoryFields: true });
    } catch (stampErr) {
      log.error({ title: title + 'stamp extras failed (bill still created)', details: stampErr });
    }
    return JSON.stringify(billResp);
  } catch (e) {
    log.error({ title: title + 'error', details: e });
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, e.message || 'Error creating payment request.');
  }
};

/* ------------------------------------------------------------------ *
 * 4) EMPLOYEE REFUND (BRD line 7 / FR-403) — reuses the expense-report create.
 * ------------------------------------------------------------------ */
static createEmployeeRefundPortal = (payload = {}) => {
  const title = 'createEmployeeRefundPortal :: ';
  try {
    // An employee refund IS an expense report against the employee. Reuse the
    // existing create, tagging the memo so it is identifiable downstream.
    const p = JSON.parse(JSON.stringify(payload || {}));
    p.header = p.header || {};
    if (!p.header.memo) p.header.memo = 'Employee refund request (Procurement Portal)';
    const resp = JSON.parse(this.createExpenseReportPortal(p) || '{}');
    // Optional: stamp a "refund" flag on the created expense report.
    if (String(resp.status) === '200' && resp.data && resp.data.id) {
      try {
        const rec = record.load({ type: record.Type.EXPENSE_REPORT, id: resp.data.id, isDynamic: false });
        try { rec.setValue({ fieldId: 'custbody_itbs_is_refund', value: true }); rec.save({ ignoreMandatoryFields: true }); } catch (e) {}
      } catch (e) {}
    }
    return JSON.stringify(resp);
  } catch (e) {
    log.error({ title: title + 'error', details: e });
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, e.message || 'Error creating employee refund.');
  }
};

/* ------------------------------------------------------------------ *
 * 5) VENDOR ONBOARDING (BRD line 6 / FR-301, FR-304 TDS)
 * ------------------------------------------------------------------ */
static getVendorOnboardingBootstrap = (payload = {}) => {
  const title = 'getVendorOnboardingBootstrap :: ';
  const list = (type, textCol) => {
    try {
      return (getAllRowsFromSearch(search.create({
        type,
        filters: [['isinactive', 'is', 'F']],
        columns: [search.createColumn({ name: 'internalid' }), search.createColumn({ name: textCol })]
      })) || []).map(r => ({ value: r.getValue({ name: 'internalid' }), text: r.getValue({ name: textCol }) || r.getText({ name: textCol }) || '' }));
    } catch (e) { log.audit({ title: title + type, details: (e && e.message) || e }); return []; }
  };
  const subsidiaries = isOneWorld() ? list('subsidiary', 'name') : [];
  const currencies   = list('currency', 'name');
  const categories   = list('vendorcategory', 'name');
  const terms        = list('term', 'name');
  const tdsCodes     = list('customlist_itbs_tds_rate', 'name'); // TODO(confirm) TDS-rate list id
  return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE,
    { subsidiaries, currencies, categories, terms, tdsCodes }, 'Ok!');
};

static createVendorRequestPortal = (payload = {}) => {
  const title = 'createVendorRequestPortal :: ';
  try {
    if (!String(payload.companyName || '').trim()) {
      return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, 'Company name is required.');
    }
    const v = record.create({ type: record.Type.VENDOR, isDynamic: true });
    v.setValue({ fieldId: 'companyname', value: String(payload.companyName) });
    v.setValue({ fieldId: 'isperson', value: false });
    if (payload.email) { try { v.setValue({ fieldId: 'email', value: String(payload.email) }); } catch (e) {} }
    if (payload.phone) { try { v.setValue({ fieldId: 'phone', value: String(payload.phone) }); } catch (e) {} }
    if (payload.subsidiaryId && isOneWorld()) { try { v.setValue({ fieldId: 'subsidiary', value: Number(payload.subsidiaryId) }); } catch (e) {} }
    if (payload.currencyId) { try { v.setValue({ fieldId: 'currency', value: Number(payload.currencyId) }); } catch (e) {} }
    if (payload.categoryId) { try { v.setValue({ fieldId: 'category', value: Number(payload.categoryId) }); } catch (e) {} }
    if (payload.termsId)    { try { v.setValue({ fieldId: 'terms',    value: Number(payload.termsId) }); } catch (e) {} }
    if (payload.taxNumber)  { try { v.setValue({ fieldId: 'custentity_itbs_brn', value: String(payload.taxNumber) }); } catch (e) {} } // TODO(confirm) BRN field
    // Bank details (TODO(confirm) field ids or use the Company Bank Detail record):
    if (payload.bankName)      { try { v.setValue({ fieldId: 'custentity_itbs_bank_name',   value: String(payload.bankName) }); } catch (e) {} }
    if (payload.bankAccountNo) { try { v.setValue({ fieldId: 'custentity_itbs_bank_acct',   value: String(payload.bankAccountNo) }); } catch (e) {} }
    if (payload.bankSwift)     { try { v.setValue({ fieldId: 'custentity_itbs_bank_swift',  value: String(payload.bankSwift) }); } catch (e) {} }
    if (payload.intermediaryBank) { try { v.setValue({ fieldId: 'custentity_itbs_intl_bank', value: String(payload.intermediaryBank) }); } catch (e) {} }
    // TDS (schema fields already exist: custentity_itbs_tds, custentity_itbs_tds_rate):
    if (payload.tdsApplicable) { try { v.setValue({ fieldId: 'custentity_itbs_tds', value: true }); } catch (e) {} }
    if (payload.tdsRateId)     { try { v.setValue({ fieldId: 'custentity_itbs_tds_rate', value: Number(payload.tdsRateId) }); } catch (e) {} }
    if (payload.notes)         { try { v.setValue({ fieldId: 'comments', value: String(payload.notes) }); } catch (e) {} }
    // Route for Finance approval: set inactive until approved, or stamp a status
    // custom field / kick a SuiteFlow. Defaulting to a pending custom flag:
    try { v.setValue({ fieldId: 'custentity_itbs_approval_status', value: 1 }); } catch (e) {} // TODO(confirm) 1 = Pending
    const id = v.save({ enableSourcing: true, ignoreMandatoryFields: true });
    return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, { id, name: String(payload.companyName) }, 'Vendor request created and sent for approval.');
  } catch (e) {
    log.error({ title: title + 'error', details: e });
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, e.message || 'Error creating vendor request.');
  }
};

/* ------------------------------------------------------------------ *
 * 6) CONTRACT REGISTER (BRD line 6 / FR-303)
 *    Uses customrecord_itbs_contract (ct_* fields per the SDF package).
 * ------------------------------------------------------------------ */
static getContractBootstrap = (payload = {}) => {
  const title = 'getContractBootstrap :: ';
  const vendors = (() => {
    try {
      return (getAllRowsFromSearch(search.create({
        type: 'vendor', filters: [['isinactive', 'is', 'F']],
        columns: [search.createColumn({ name: 'internalid' }), search.createColumn({ name: 'entityid' })]
      })) || []).map(r => ({ value: r.getValue({ name: 'internalid' }), text: r.getValue({ name: 'entityid' }) }));
    } catch (e) { return []; }
  })();
  let statuses = [];
  try {
    statuses = (getAllRowsFromSearch(search.create({
      type: 'customlist_itbs_ctr_stat',
      columns: [search.createColumn({ name: 'internalid' }), search.createColumn({ name: 'name' })]
    })) || []).map(r => ({ value: r.getValue({ name: 'internalid' }), text: r.getValue({ name: 'name' }) }));
  } catch (e) {}
  return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, { vendors, statuses }, 'Ok!');
};

static getContractsList = (payload = {}) => {
  const title = 'getContractsList :: ';
  const RT = 'customrecord_itbs_contract';
  if (!recordTypeExists(RT)) {
    return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, { contracts: [] }, 'Contract Register not installed.');
  }
  try {
    const rows = getAllRowsFromSearch(search.create({
      type: RT,
      columns: [
        search.createColumn({ name: 'internalid' }),
        search.createColumn({ name: 'name' }),
        search.createColumn({ name: 'custrecord_itbs_ct_vendor' }),        // TODO(confirm) ct field ids
        search.createColumn({ name: 'custrecord_itbs_ct_start' }),
        search.createColumn({ name: 'custrecord_itbs_ct_end' }),
        search.createColumn({ name: 'custrecord_itbs_ct_value' }),
        search.createColumn({ name: 'custrecord_itbs_ct_status' })
      ]
    })) || [];
    const contracts = rows.map(r => ({
      id: r.getValue({ name: 'internalid' }),
      title: r.getValue({ name: 'name' }),
      vendorName: r.getText({ name: 'custrecord_itbs_ct_vendor' }) || '',
      startDate: this.toISODateString(r.getValue({ name: 'custrecord_itbs_ct_start' })),
      endDate: this.toISODateString(r.getValue({ name: 'custrecord_itbs_ct_end' })),
      value: this.toNumber(r.getValue({ name: 'custrecord_itbs_ct_value' })),
      status: r.getText({ name: 'custrecord_itbs_ct_status' }) || ''
    }));
    return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, { contracts }, 'Ok!');
  } catch (e) {
    log.error({ title: title + 'error', details: e });
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, e.message || 'Error loading contracts.');
  }
};

static createContractPortal = (payload = {}) => {
  const title = 'createContractPortal :: ';
  const RT = 'customrecord_itbs_contract';
  if (!recordTypeExists(RT)) {
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, 'Contract Register record is not installed in this account.');
  }
  try {
    if (!payload.vendorId || !String(payload.title || '').trim() || !payload.endDate) {
      return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, 'Vendor, title and end date are required.');
    }
    const c = record.create({ type: RT });
    c.setValue({ fieldId: 'name', value: String(payload.title) });
    try { c.setValue({ fieldId: 'custrecord_itbs_ct_vendor', value: Number(payload.vendorId) }); } catch (e) {}
    if (payload.startDate) { try { c.setValue({ fieldId: 'custrecord_itbs_ct_start', value: this.parsePortalDate(payload.startDate) }); } catch (e) {} }
    try { c.setValue({ fieldId: 'custrecord_itbs_ct_end', value: this.parsePortalDate(payload.endDate) }); } catch (e) {}
    if (this.toNumber(payload.value)) { try { c.setValue({ fieldId: 'custrecord_itbs_ct_value', value: this.toNumber(payload.value) }); } catch (e) {} }
    if (payload.statusId) { try { c.setValue({ fieldId: 'custrecord_itbs_ct_status', value: Number(payload.statusId) }); } catch (e) {} }
    if (payload.notes) { try { c.setValue({ fieldId: 'custrecord_itbs_ct_notes', value: String(payload.notes) }); } catch (e) {} }
    const id = c.save({ ignoreMandatoryFields: true });
    return this.formatResponse(constants.ResponseCodes.SUCCESS_CODE, { id }, 'Contract saved.');
  } catch (e) {
    log.error({ title: title + 'error', details: e });
    return this.formatResponse(constants.ResponseCodes.ERROR_CODE, null, e.message || 'Error saving contract.');
  }
};

/* ============================================================================
 * ALSO ADD THESE NAMES TO constants.ActionType (string values must match the
 * portal exactly):
 *   GET_REQUISITION_BOOTSTRAP, CREATE_REQUISITION_PORTAL, GET_REQUISITIONS_LIST,
 *   GET_PO_CLASSIFICATIONS, CREATE_PAYMENT_REQUEST_PORTAL,
 *   CREATE_EMPLOYEE_REFUND_PORTAL, GET_VENDOR_ONBOARDING_BOOTSTRAP,
 *   CREATE_VENDOR_REQUEST_PORTAL, GET_CONTRACT_BOOTSTRAP, GET_CONTRACTS_LIST,
 *   CREATE_CONTRACT_PORTAL
 * e.g.  GET_REQUISITIONS_LIST: 'GET_REQUISITIONS_LIST',  (value === key)
 * ============================================================================ */
