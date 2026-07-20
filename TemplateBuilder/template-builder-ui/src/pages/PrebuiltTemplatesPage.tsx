// src/pages/PrebuiltTemplatesPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTemplate, updateTemplate, listTemplates } from '../api/templates';
import type { OutputTarget, LayoutBlock } from '../types/api';

interface PrebuiltTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  industryLabel: string;
  output_target: OutputTarget;
  tags: string[];
  preview_blocks: string[];
  layout_json: { blocks: LayoutBlock[] };
}

const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [

  // ── BANKING ──────────────────────────────────────────────────────
  {
    id: 'banking-loan-closure',
    name: 'Loan Closure Letter',
    description: 'Formal letter confirming full repayment and closure of a loan account with NOC clause.',
    industry: 'banking', industryLabel: '🏦 Banking',
    output_target: 'pdf',
    tags: ['banking', 'loan', 'closure', 'noc'],
    preview_blocks: ['Bank address & date', 'Borrower address', 'Subject & greeting', 'Loan summary table', 'Closure confirmation body', 'NOC declaration', 'Authorised signatory'],
    layout_json: { blocks: [
      { block_id: 'blc-1', type: 'text', content: '{{bank_name}}\n{{bank_branch}}, {{bank_city}}\nDate: {{closure_date}}' },
      { block_id: 'blc-2', type: 'text', content: 'To,\n{{customer_name}}\n{{customer_address}}\n{{customer_city}} - {{customer_pincode}}' },
      { block_id: 'blc-3', type: 'text', content: 'Subject: Closure of Loan Account No. {{loan_number}}\n\nDear {{customer_name}},' },
      { block_id: 'blc-4', type: 'table', columns: [
        { header: 'Loan Account No.', binding: '{{loan_number}}' },
        { header: 'Loan Type', binding: '{{loan_type}}' },
        { header: 'Disbursement Date', binding: '{{disbursement_date}}' },
        { header: 'Closure Date', binding: '{{closure_date}}' },
        { header: 'Total Amount Repaid', binding: '{{total_repaid}}' },
      ]},
      { block_id: 'blc-5', type: 'text', content: 'We are pleased to confirm that your above-mentioned loan account has been fully repaid and closed as on {{closure_date}}. All outstanding dues including principal, interest, and applicable charges have been settled in full.\n\nYour repayment record with our bank has been satisfactory throughout the loan tenure.' },
      { block_id: 'blc-6', type: 'text', content: 'This letter also serves as a No Objection Certificate (NOC) confirming that {{bank_name}} has no further claim or lien on any collateral or security pledged against the said loan account.\n\nKindly retain this letter for your records.' },
      { block_id: 'blc-7', type: 'text', content: 'For {{bank_name}},\n\n\n_______________________________\n{{authorised_signatory_name}}\n{{designation}}\n{{bank_name}}, {{bank_branch}}' },
    ]},
  },

  {
    id: 'banking-account-statement',
    name: 'Monthly Account Statement',
    description: 'Bank account statement with all credits, debits, and opening/closing balance summary.',
    industry: 'banking', industryLabel: '🏦 Banking',
    output_target: 'xlsx',
    tags: ['banking', 'statement', 'account', 'monthly'],
    preview_blocks: ['Bank & account header', 'Customer & period info', 'Opening balance', 'Transaction table', 'Closing balance', 'Disclaimer note'],
    layout_json: { blocks: [
      { block_id: 'bas-1', type: 'text', content: '{{bank_name}} - Account Statement\nAccount Number: {{account_number}}\nIFSC: {{ifsc_code}} | Branch: {{bank_branch}}' },
      { block_id: 'bas-2', type: 'table', columns: [
        { header: 'Account Holder', binding: '{{customer_name}}' },
        { header: 'Account Type', binding: '{{account_type}}' },
        { header: 'Statement From', binding: '{{from_date}}' },
        { header: 'Statement To', binding: '{{to_date}}' },
      ]},
      { block_id: 'bas-3', type: 'text', content: 'Opening Balance as on {{from_date}}: {{opening_balance}}' },
      { block_id: 'bas-4', type: 'table', columns: [
        { header: 'Date', binding: '{{txn_date}}' },
        { header: 'Narration', binding: '{{narration}}' },
        { header: 'Cheque/Ref No.', binding: '{{ref_no}}' },
        { header: 'Credit (INR)', binding: '{{credit}}' },
        { header: 'Debit (INR)', binding: '{{debit}}' },
        { header: 'Balance (INR)', binding: '{{balance}}' },
      ], repeat: '{{transactions}}' },
      { block_id: 'bas-5', type: 'text', content: 'Closing Balance as on {{to_date}}: {{closing_balance}}\n\nTotal Credits: {{total_credits}}    Total Debits: {{total_debits}}' },
      { block_id: 'bas-6', type: 'text', content: 'This is a computer-generated statement and does not require a physical signature. For any discrepancy, please contact your branch within 30 days of receipt.' },
    ]},
  },

  {
    id: 'banking-kyc-form',
    name: 'KYC Verification Form',
    description: 'Know Your Customer form collecting identity, address proof, and declaration for compliance.',
    industry: 'banking', industryLabel: '🏦 Banking',
    output_target: 'docx',
    tags: ['banking', 'kyc', 'compliance', 'form'],
    preview_blocks: ['Form title', 'Personal details section', 'Contact details', 'Address details', 'Documents section', 'Declaration & signature'],
    layout_json: { blocks: [
      { block_id: 'bky-1', type: 'text', content: '{{bank_name}}\nKNOW YOUR CUSTOMER (KYC) VERIFICATION FORM\nApplication Date: {{application_date}}' },
      { block_id: 'bky-2', type: 'section', content: '1. PERSONAL DETAILS', children: [] },
      { block_id: 'bky-3', type: 'table', columns: [
        { header: 'Full Name', binding: '{{full_name}}' },
        { header: 'Date of Birth', binding: '{{dob}}' },
        { header: 'Gender', binding: '{{gender}}' },
        { header: 'Nationality', binding: '{{nationality}}' },
      ]},
      { block_id: 'bky-4', type: 'table', columns: [
        { header: 'PAN Number', binding: '{{pan_number}}' },
        { header: 'Aadhaar Number', binding: '{{aadhaar_number}}' },
        { header: 'Occupation', binding: '{{occupation}}' },
        { header: 'Annual Income', binding: '{{annual_income}}' },
      ]},
      { block_id: 'bky-5', type: 'section', content: '2. CONTACT & ADDRESS', children: [] },
      { block_id: 'bky-6', type: 'table', columns: [
        { header: 'Mobile Number', binding: '{{mobile}}' },
        { header: 'Email Address', binding: '{{email}}' },
        { header: 'Alternate Mobile', binding: '{{alt_mobile}}' },
      ]},
      { block_id: 'bky-7', type: 'text', content: 'Residential Address:\n{{address_line1}}, {{address_line2}}\n{{city}}, {{state}} - {{pincode}}\nCountry: {{country}}' },
      { block_id: 'bky-8', type: 'section', content: '3. DOCUMENTS SUBMITTED', children: [] },
      { block_id: 'bky-9', type: 'table', columns: [
        { header: 'Document Type', binding: '{{doc_type}}' },
        { header: 'Document Number', binding: '{{doc_number}}' },
        { header: 'Issued By', binding: '{{issued_by}}' },
        { header: 'Valid Until', binding: '{{valid_until}}' },
      ], repeat: '{{documents}}' },
      { block_id: 'bky-10', type: 'text', content: 'DECLARATION\n\nI hereby declare that the information furnished above is true, correct, and complete to the best of my knowledge. I undertake to inform the bank of any changes in the above particulars.\n\nCustomer Signature: ___________________________\nDate: {{application_date}}\nPlace: {{city}}' },
    ]},
  },

  {
    id: 'banking-loan-sanction',
    name: 'Loan Sanction Letter',
    description: 'Official letter communicating loan approval with amount, interest rate, tenure, and repayment terms.',
    industry: 'banking', industryLabel: '🏦 Banking',
    output_target: 'pdf',
    tags: ['banking', 'loan', 'sanction', 'approval'],
    preview_blocks: ['Bank letterhead', 'Applicant address', 'Sanction confirmation', 'Loan terms table', 'Repayment note', 'Conditions precedent', 'Acceptance section'],
    layout_json: { blocks: [
      { block_id: 'bls-1', type: 'text', content: '{{bank_name}}\n{{bank_address}}\nRef No: {{ref_number}}\nDate: {{sanction_date}}' },
      { block_id: 'bls-2', type: 'text', content: 'To,\n{{applicant_name}}\n{{applicant_address}}\n\nDear {{applicant_name}},' },
      { block_id: 'bls-3', type: 'text', content: 'Sub: Sanction of {{loan_type}} - Rs. {{loan_amount}}\n\nWe are pleased to inform you that your application for the above loan has been sanctioned by our competent authority, subject to the terms and conditions mentioned below.' },
      { block_id: 'bls-4', type: 'table', columns: [
        { header: 'Loan Amount (INR)', binding: '{{loan_amount}}' },
        { header: 'Interest Rate', binding: '{{interest_rate}}% p.a.' },
        { header: 'Tenure', binding: '{{tenure}} months' },
        { header: 'EMI Amount (INR)', binding: '{{emi_amount}}' },
        { header: 'Processing Fee (INR)', binding: '{{processing_fee}}' },
      ]},
      { block_id: 'bls-5', type: 'text', content: 'Repayment: The loan shall be repaid in {{tenure}} equal monthly instalments of {{emi_amount}} each, commencing from {{emi_start_date}}.\n\nSecurity: {{security_details}}' },
      { block_id: 'bls-6', type: 'text', content: 'CONDITIONS PRECEDENT:\n1. Submission of original property documents / collateral as applicable.\n2. Execution of loan agreement and related documents.\n3. Disbursement subject to satisfactory legal and technical verification.\n4. The bank reserves the right to cancel this sanction if conditions are not met within {{validity_days}} days.' },
      { block_id: 'bls-7', type: 'text', content: 'ACCEPTANCE\n\nI/We accept the above terms and conditions.\n\nSignature: ___________________________     Date: ____________\n{{applicant_name}}' },
    ]},
  },

  // ── INSURANCE ────────────────────────────────────────────────────
  {
    id: 'insurance-policy-schedule',
    name: 'Insurance Policy Schedule',
    description: 'Policy schedule outlining coverage details, premium, insured information, and key policy dates.',
    industry: 'insurance', industryLabel: '🛡 Insurance',
    output_target: 'pdf',
    tags: ['insurance', 'policy', 'schedule', 'coverage'],
    preview_blocks: ['Insurer header', 'Policy details table', 'Coverage summary table', 'Premium breakdown table', 'Nominee details', 'Terms note'],
    layout_json: { blocks: [
      { block_id: 'ips-1', type: 'text', content: '{{insurer_name}}\nCIN: {{cin_number}} | IRDAI Reg. No.: {{irdai_reg}}\nCorporate Office: {{insurer_address}}\n\nPOLICY SCHEDULE\nPolicy Number: {{policy_number}}' },
      { block_id: 'ips-2', type: 'table', columns: [
        { header: 'Policy Holder', binding: '{{holder_name}}' },
        { header: 'Date of Birth', binding: '{{holder_dob}}' },
        { header: 'Policy Type', binding: '{{policy_type}}' },
        { header: 'Policy Start', binding: '{{start_date}}' },
        { header: 'Policy End', binding: '{{end_date}}' },
      ]},
      { block_id: 'ips-3', type: 'table', columns: [
        { header: 'Coverage Type', binding: '{{coverage_type}}' },
        { header: 'Sum Insured (INR)', binding: '{{sum_insured}}' },
        { header: 'Sub-limit (INR)', binding: '{{sub_limit}}' },
        { header: 'Deductible (INR)', binding: '{{deductible}}' },
      ], repeat: '{{coverages}}' },
      { block_id: 'ips-4', type: 'table', columns: [
        { header: 'Basic Premium (INR)', binding: '{{basic_premium}}' },
        { header: 'GST 18% (INR)', binding: '{{gst_amount}}' },
        { header: 'Total Premium (INR)', binding: '{{total_premium}}' },
        { header: 'Premium Due Date', binding: '{{premium_due_date}}' },
      ]},
      { block_id: 'ips-5', type: 'text', content: 'Nominee: {{nominee_name}} | Relationship: {{nominee_relation}} | DOB: {{nominee_dob}}' },
      { block_id: 'ips-6', type: 'text', content: 'This policy is subject to the terms, conditions, and exclusions contained in the policy wordings. For claims, contact our 24x7 helpline: {{claims_helpline}}.' },
    ]},
  },

  {
    id: 'insurance-claim-settlement',
    name: 'Claim Settlement Letter',
    description: 'Formal letter communicating claim approval, settlement amount, and payment instructions.',
    industry: 'insurance', industryLabel: '🛡 Insurance',
    output_target: 'pdf',
    tags: ['insurance', 'claim', 'settlement', 'letter'],
    preview_blocks: ['Insurer letterhead', 'Claimant address', 'Claim reference', 'Assessment table', 'Net settlement', 'Payment details', 'Discharge voucher'],
    layout_json: { blocks: [
      { block_id: 'icl-1', type: 'text', content: '{{insurer_name}}\nDate: {{settlement_date}}\nClaim Ref: {{claim_number}} | Policy No: {{policy_number}}' },
      { block_id: 'icl-2', type: 'text', content: 'To,\n{{claimant_name}}\n{{claimant_address}}\n\nDear {{claimant_name}},' },
      { block_id: 'icl-3', type: 'text', content: 'Subject: Settlement of Claim No. {{claim_number}}\n\nWe refer to your claim submitted on {{claim_date}}. After due examination of all documents and survey report, we are pleased to inform that your claim has been assessed and approved as follows:' },
      { block_id: 'icl-4', type: 'table', columns: [
        { header: 'Loss Description', binding: '{{loss_description}}' },
        { header: 'Date of Loss', binding: '{{loss_date}}' },
        { header: 'Claimed Amount (INR)', binding: '{{claimed_amount}}' },
        { header: 'Approved Amount (INR)', binding: '{{approved_amount}}' },
        { header: 'Deductions (INR)', binding: '{{deductions}}' },
      ]},
      { block_id: 'icl-5', type: 'text', content: 'Net Settlement Amount: {{net_payable}}\n\nReason for Deductions: {{deduction_reason}}' },
      { block_id: 'icl-6', type: 'text', content: 'Payment Mode: {{payment_mode}}\nBank: {{claimant_bank}} | Account: {{claimant_account}} | IFSC: {{claimant_ifsc}}\n\nThe settlement amount will be credited within {{payment_days}} working days from receipt of the signed discharge voucher.' },
      { block_id: 'icl-7', type: 'text', content: 'DISCHARGE VOUCHER\n\nI/We hereby confirm receipt of {{net_payable}} in full and final settlement of the above claim.\n\nSignature: ___________________________\n{{claimant_name}}\nDate: ____________' },
    ]},
  },

  // ── HEALTHCARE ───────────────────────────────────────────────────
  {
    id: 'healthcare-discharge-summary',
    name: 'Patient Discharge Summary',
    description: 'Clinical discharge summary covering diagnosis, treatment, medications, and follow-up instructions.',
    industry: 'healthcare', industryLabel: '🏥 Healthcare',
    output_target: 'pdf',
    tags: ['healthcare', 'discharge', 'clinical', 'patient'],
    preview_blocks: ['Hospital header', 'Patient demographics table', 'Admission & discharge table', 'Diagnosis & procedures', 'Vitals table', 'Medications table', 'Follow-up instructions', 'Doctor signature'],
    layout_json: { blocks: [
      { block_id: 'hds-1', type: 'text', content: '{{hospital_name}}\n{{hospital_address}}\nPhone: {{hospital_phone}} | Email: {{hospital_email}}\n\nDISCHARGE SUMMARY' },
      { block_id: 'hds-2', type: 'table', columns: [
        { header: 'Patient Name', binding: '{{patient_name}}' },
        { header: 'MRN / UHID', binding: '{{mrn}}' },
        { header: 'Age / Sex', binding: '{{age_sex}}' },
        { header: 'Ward / Bed', binding: '{{ward_bed}}' },
      ]},
      { block_id: 'hds-3', type: 'table', columns: [
        { header: 'Date of Admission', binding: '{{admit_date}}' },
        { header: 'Date of Discharge', binding: '{{discharge_date}}' },
        { header: 'Total Days', binding: '{{total_days}}' },
        { header: 'Attending Doctor', binding: '{{doctor_name}}' },
      ]},
      { block_id: 'hds-4', type: 'text', content: 'PRIMARY DIAGNOSIS: {{primary_diagnosis}}\nSECONDARY DIAGNOSIS: {{secondary_diagnosis}}\nPROCEDURE(S) PERFORMED: {{procedures}}\nCOMPLICATIONS: {{complications}}' },
      { block_id: 'hds-5', type: 'table', columns: [
        { header: 'BP', binding: '{{bp}}' },
        { header: 'Pulse', binding: '{{pulse}}' },
        { header: 'Temperature', binding: '{{temperature}}' },
        { header: 'SpO2', binding: '{{spo2}}' },
        { header: 'Weight', binding: '{{weight}}' },
      ]},
      { block_id: 'hds-6', type: 'table', columns: [
        { header: 'Medicine Name', binding: '{{medicine_name}}' },
        { header: 'Dose', binding: '{{dose}}' },
        { header: 'Frequency', binding: '{{frequency}}' },
        { header: 'Duration', binding: '{{duration}}' },
        { header: 'Route', binding: '{{route}}' },
      ], repeat: '{{medications}}' },
      { block_id: 'hds-7', type: 'text', content: 'FOLLOW-UP INSTRUCTIONS:\n{{followup_instructions}}\n\nNEXT REVIEW DATE: {{next_review_date}}\nDIET ADVICE: {{diet_advice}}\nACTIVITY RESTRICTION: {{activity_restriction}}' },
      { block_id: 'hds-8', type: 'text', content: 'Dr. {{doctor_name}}\n{{qualification}}\n{{department}}\n{{hospital_name}}\n\nSignature: ___________________________' },
    ]},
  },

  {
    id: 'healthcare-medical-certificate',
    name: 'Medical Fitness Certificate',
    description: 'Certificate issued by a physician confirming fitness or unfitness for duty, travel, or sports.',
    industry: 'healthcare', industryLabel: '🏥 Healthcare',
    output_target: 'pdf',
    tags: ['healthcare', 'certificate', 'fitness', 'medical'],
    preview_blocks: ['Doctor letterhead', 'Certificate title', 'Patient details table', 'Clinical findings', 'Fitness declaration', 'Validity & restrictions', 'Doctor signature'],
    layout_json: { blocks: [
      { block_id: 'hmc-1', type: 'text', content: 'Dr. {{doctor_name}}\n{{qualification}}, {{specialisation}}\nMedical Registration No.: {{reg_number}}\n{{clinic_name}}, {{clinic_address}}\nPhone: {{clinic_phone}}' },
      { block_id: 'hmc-2', type: 'text', content: 'MEDICAL FITNESS CERTIFICATE\nCertificate No.: {{cert_number}}\nDate of Issue: {{cert_date}}' },
      { block_id: 'hmc-3', type: 'table', columns: [
        { header: 'Patient Name', binding: '{{patient_name}}' },
        { header: 'Age', binding: '{{age}}' },
        { header: 'Sex', binding: '{{sex}}' },
        { header: 'Date of Examination', binding: '{{exam_date}}' },
      ]},
      { block_id: 'hmc-4', type: 'text', content: 'CLINICAL FINDINGS:\nHeight: {{height}} | Weight: {{weight}} | BMI: {{bmi}}\nBlood Pressure: {{bp}} | Pulse Rate: {{pulse}}\nVision: {{vision}} | Hearing: {{hearing}}\nOther Findings: {{other_findings}}' },
      { block_id: 'hmc-5', type: 'text', content: 'CERTIFICATE:\n\nThis is to certify that {{patient_name}}, having been examined by me on {{exam_date}}, is found to be medically {{fit_status}} for {{purpose}}.\n\n{{additional_remarks}}' },
      { block_id: 'hmc-6', type: 'text', content: 'This certificate is valid until: {{valid_until}}\nRestrictions (if any): {{restrictions}}' },
      { block_id: 'hmc-7', type: 'text', content: 'Dr. {{doctor_name}}\n{{qualification}}\nReg. No: {{reg_number}}\n\nSignature and Stamp: ___________________________' },
    ]},
  },

  {
    id: 'healthcare-lab-report',
    name: 'Laboratory Test Report',
    description: 'Pathology lab report presenting test results with reference ranges, units, and interpretation.',
    industry: 'healthcare', industryLabel: '🏥 Healthcare',
    output_target: 'pdf',
    tags: ['healthcare', 'lab', 'pathology', 'report'],
    preview_blocks: ['Lab header', 'Patient & sample info table', 'Referring doctor', 'Test results table', 'Clinical notes', 'Pathologist signature'],
    layout_json: { blocks: [
      { block_id: 'hlr-1', type: 'text', content: '{{lab_name}}\n{{lab_address}}\nNABL Accreditation No.: {{nabl_number}} | Phone: {{lab_phone}}\nEmail: {{lab_email}}\n\nLABORATORY TEST REPORT' },
      { block_id: 'hlr-2', type: 'table', columns: [
        { header: 'Patient Name', binding: '{{patient_name}}' },
        { header: 'Age / Sex', binding: '{{age_sex}}' },
        { header: 'Sample ID', binding: '{{sample_id}}' },
        { header: 'Collection Date', binding: '{{collection_date}}' },
        { header: 'Report Date', binding: '{{report_date}}' },
      ]},
      { block_id: 'hlr-3', type: 'text', content: 'Referred By: Dr. {{referring_doctor}}\nClinical History: {{clinical_history}}' },
      { block_id: 'hlr-4', type: 'table', columns: [
        { header: 'Test Name', binding: '{{test_name}}' },
        { header: 'Result', binding: '{{result}}' },
        { header: 'Unit', binding: '{{unit}}' },
        { header: 'Reference Range', binding: '{{reference_range}}' },
        { header: 'Flag', binding: '{{flag}}' },
      ], repeat: '{{test_results}}' },
      { block_id: 'hlr-5', type: 'text', content: 'CLINICAL NOTES:\n{{clinical_notes}}\n\nThis report is generated electronically. Results should be interpreted in conjunction with clinical findings.' },
      { block_id: 'hlr-6', type: 'text', content: '{{pathologist_name}}\n{{pathologist_qualification}}\nMedical Director, {{lab_name}}\n\nSignature: ___________________________' },
    ]},
  },

  // ── LEGAL ────────────────────────────────────────────────────────
  {
    id: 'legal-nda',
    name: 'Non-Disclosure Agreement',
    description: 'Standard bilateral NDA covering confidential information, obligations, duration, and governing law.',
    industry: 'legal', industryLabel: '⚖ Legal',
    output_target: 'docx',
    tags: ['legal', 'nda', 'contract', 'confidentiality'],
    preview_blocks: ['Agreement title & parties', 'Recitals', 'Definitions clause', 'Obligations of parties', 'Exclusions', 'Term clause', 'Governing law', 'Signature blocks'],
    layout_json: { blocks: [
      { block_id: 'lnd-1', type: 'text', content: 'NON-DISCLOSURE AGREEMENT\n\nThis Non-Disclosure Agreement ("Agreement") is entered into as of {{agreement_date}} by and between:\n\n{{party_a_name}}, having its registered office at {{party_a_address}} ("Disclosing Party")\n\nAND\n\n{{party_b_name}}, having its registered office at {{party_b_address}} ("Receiving Party").' },
      { block_id: 'lnd-2', type: 'text', content: 'RECITALS\n\nWHEREAS, the Parties wish to explore a potential business relationship relating to {{purpose}}; and\nWHEREAS, the Disclosing Party may disclose certain Confidential Information to the Receiving Party;\n\nNOW, THEREFORE, the Parties agree as follows:' },
      { block_id: 'lnd-3', type: 'text', content: '1. DEFINITION OF CONFIDENTIAL INFORMATION\n\n"Confidential Information" means any and all technical, business, financial, or other information disclosed by the Disclosing Party, whether in oral, written, graphic, or electronic form, including but not limited to: trade secrets, know-how, inventions, processes, formulas, data, software, designs, customer lists, financial statements, and business plans.' },
      { block_id: 'lnd-4', type: 'text', content: '2. OBLIGATIONS OF RECEIVING PARTY\n\nThe Receiving Party agrees to:\n(a) Hold all Confidential Information in strict confidence;\n(b) Not disclose Confidential Information to any third party without prior written consent;\n(c) Use Confidential Information solely for the Business Purpose;\n(d) Restrict access to employees or contractors bound by equivalent confidentiality obligations.' },
      { block_id: 'lnd-5', type: 'text', content: '3. EXCLUSIONS\n\nThis Agreement shall not apply to information that:\n(a) Is or becomes publicly available through no breach of this Agreement;\n(b) Was rightfully known to the Receiving Party prior to disclosure;\n(c) Is rightfully obtained from a third party without restriction;\n(d) Is independently developed without use of Confidential Information;\n(e) Is required to be disclosed by law or court order.' },
      { block_id: 'lnd-6', type: 'text', content: '4. TERM\n\nThis Agreement shall be effective from {{agreement_date}} and shall continue for {{duration}} years. Confidentiality obligations shall survive termination for {{survival_period}} years.\n\n5. GOVERNING LAW\n\nThis Agreement shall be governed by the laws of {{governing_jurisdiction}}. Disputes shall be subject to the exclusive jurisdiction of the courts of {{court_jurisdiction}}.' },
      { block_id: 'lnd-7', type: 'table', columns: [
        { header: 'For Disclosing Party', binding: '{{party_a_signatory}}' },
        { header: 'For Receiving Party', binding: '{{party_b_signatory}}' },
      ]},
      { block_id: 'lnd-8', type: 'table', columns: [
        { header: 'Name', binding: '{{party_a_name_signed}}' },
        { header: 'Name', binding: '{{party_b_name_signed}}' },
      ]},
      { block_id: 'lnd-9', type: 'table', columns: [
        { header: 'Title', binding: '{{party_a_title}}' },
        { header: 'Title', binding: '{{party_b_title}}' },
      ]},
      { block_id: 'lnd-10', type: 'table', columns: [
        { header: 'Date', binding: '{{agreement_date}}' },
        { header: 'Date', binding: '{{agreement_date}}' },
      ]},
    ]},
  },

  {
    id: 'legal-appointment-letter',
    name: 'Employment Appointment Letter',
    description: 'Official appointment letter covering designation, CTC, joining date, reporting, and employment terms.',
    industry: 'legal', industryLabel: '⚖ Legal',
    output_target: 'docx',
    tags: ['legal', 'hr', 'appointment', 'employment'],
    preview_blocks: ['Company letterhead', 'Candidate address', 'Appointment confirmation', 'Role & reporting table', 'Salary breakdown table', 'Terms & conditions', 'Acceptance section'],
    layout_json: { blocks: [
      { block_id: 'lal-1', type: 'text', content: '{{company_name}}\n{{company_address}}\n\nRef: {{letter_ref}}\nDate: {{issue_date}}' },
      { block_id: 'lal-2', type: 'text', content: 'To,\n{{candidate_name}}\n{{candidate_address}}\n\nDear {{candidate_name}},' },
      { block_id: 'lal-3', type: 'text', content: 'Subject: Appointment as {{designation}} - {{company_name}}\n\nWe are pleased to appoint you as {{designation}} in the {{department}} department of {{company_name}}, with effect from {{joining_date}}.' },
      { block_id: 'lal-4', type: 'table', columns: [
        { header: 'Designation', binding: '{{designation}}' },
        { header: 'Department', binding: '{{department}}' },
        { header: 'Location', binding: '{{work_location}}' },
        { header: 'Reporting To', binding: '{{reporting_manager}}' },
        { header: 'Employee ID', binding: '{{employee_id}}' },
      ]},
      { block_id: 'lal-5', type: 'table', columns: [
        { header: 'Salary Component', binding: '{{component_name}}' },
        { header: 'Monthly (INR)', binding: '{{monthly_amount}}' },
        { header: 'Annual (INR)', binding: '{{annual_amount}}' },
      ], repeat: '{{salary_components}}' },
      { block_id: 'lal-6', type: 'text', content: 'TERMS AND CONDITIONS:\n\n1. Probation: You will be on probation for {{probation_period}} months from the date of joining.\n2. Working Hours: Standard office hours as per company policy ({{working_hours}}).\n3. Leave Entitlement: {{leave_entitlement}} days per annum as per company leave policy.\n4. Notice Period: {{notice_period}} months on either side after confirmation.\n5. Confidentiality: You shall not disclose any confidential or proprietary information of the company.\n6. This offer is subject to satisfactory completion of background verification.' },
      { block_id: 'lal-7', type: 'text', content: 'ACCEPTANCE\n\nKindly sign and return a copy of this letter as acceptance of the above terms.\n\nSignature: ___________________________\n{{candidate_name}}\nDate: ____________\n\nFor {{company_name}},\n\n___________________________\n{{hr_name}}\n{{hr_designation}}\nHuman Resources' },
    ]},
  },

  {
    id: 'legal-service-agreement',
    name: 'Service Agreement',
    description: 'Professional services agreement defining scope, deliverables, payment terms, and liability.',
    industry: 'legal', industryLabel: '⚖ Legal',
    output_target: 'docx',
    tags: ['legal', 'contract', 'services', 'agreement'],
    preview_blocks: ['Agreement title & parties', 'Scope of services', 'Deliverables table', 'Payment schedule table', 'IP & liability clauses', 'Termination clause', 'Signature blocks'],
    layout_json: { blocks: [
      { block_id: 'lsa-1', type: 'text', content: 'SERVICE AGREEMENT\n\nThis Service Agreement ("Agreement") is made on {{agreement_date}} between:\n\nService Provider: {{provider_name}}, {{provider_address}}\nClient: {{client_name}}, {{client_address}}' },
      { block_id: 'lsa-2', type: 'text', content: '1. SCOPE OF SERVICES\n\nThe Service Provider agrees to provide the following services:\n{{scope_of_services}}\n\nCommencement Date: {{start_date}}\nCompletion Date: {{end_date}}' },
      { block_id: 'lsa-3', type: 'table', columns: [
        { header: 'Deliverable', binding: '{{deliverable_name}}' },
        { header: 'Description', binding: '{{deliverable_desc}}' },
        { header: 'Due Date', binding: '{{due_date}}' },
        { header: 'Acceptance Criteria', binding: '{{acceptance_criteria}}' },
      ], repeat: '{{deliverables}}' },
      { block_id: 'lsa-4', type: 'table', columns: [
        { header: 'Milestone', binding: '{{milestone}}' },
        { header: 'Amount (INR)', binding: '{{amount}}' },
        { header: 'Due Date', binding: '{{payment_due_date}}' },
        { header: 'Payment Mode', binding: '{{payment_mode}}' },
      ], repeat: '{{payment_schedule}}' },
      { block_id: 'lsa-5', type: 'text', content: '2. INTELLECTUAL PROPERTY\n\nAll work product created in performance of this Agreement shall, upon full payment, become the exclusive property of the Client.\n\n3. LIMITATION OF LIABILITY\n\nTotal liability shall not exceed the total fees paid in the three months preceding the claim. Neither party shall be liable for indirect, incidental, or consequential damages.' },
      { block_id: 'lsa-6', type: 'text', content: '4. TERMINATION\n\nEither party may terminate this Agreement by giving {{notice_period}} days written notice. The Client shall pay for all services rendered up to the date of termination.\n\n5. GOVERNING LAW\n\nThis Agreement shall be governed by the laws of {{governing_law}}.' },
      { block_id: 'lsa-7', type: 'table', columns: [
        { header: 'Service Provider', binding: '{{provider_signatory}}' },
        { header: 'Client', binding: '{{client_signatory}}' },
      ]},
    ]},
  },

  {
    id: 'legal-experience-letter',
    name: 'Experience / Relieving Letter',
    description: 'Official letter confirming an employee tenure, designation held, and relieving from duties.',
    industry: 'legal', industryLabel: '⚖ Legal',
    output_target: 'docx',
    tags: ['hr', 'experience', 'relieving', 'employment'],
    preview_blocks: ['Company letterhead', 'To whom it may concern', 'Employee details table', 'Designations held table', 'Service certification', 'Relieving confirmation', 'HR signature'],
    layout_json: { blocks: [
      { block_id: 'hre-1', type: 'text', content: '{{company_name}}\n{{company_address}}\n\nDate: {{issue_date}}' },
      { block_id: 'hre-2', type: 'text', content: 'TO WHOM IT MAY CONCERN' },
      { block_id: 'hre-3', type: 'table', columns: [
        { header: 'Employee Name', binding: '{{employee_name}}' },
        { header: 'Employee ID', binding: '{{employee_id}}' },
        { header: 'Department', binding: '{{department}}' },
        { header: 'Date of Joining', binding: '{{date_of_joining}}' },
        { header: 'Last Working Day', binding: '{{last_working_day}}' },
      ]},
      { block_id: 'hre-4', type: 'table', columns: [
        { header: 'Period', binding: '{{period}}' },
        { header: 'Designation', binding: '{{designation}}' },
        { header: 'Department', binding: '{{dept_name}}' },
      ], repeat: '{{designations_held}}' },
      { block_id: 'hre-5', type: 'text', content: 'This is to certify that {{employee_name}} was employed with {{company_name}} from {{date_of_joining}} to {{last_working_day}}, holding the position of {{last_designation}} in the {{department}} department.\n\nDuring his/her tenure, {{employee_name}} has demonstrated {{performance_summary}}. His/Her conduct was {{conduct}} throughout the period of service.' },
      { block_id: 'hre-6', type: 'text', content: '{{employee_name}} has been relieved from his/her duties with effect from {{last_working_day}} and all dues have been settled. We wish him/her all the best in future endeavours.' },
      { block_id: 'hre-7', type: 'text', content: 'For {{company_name}},\n\n_______________________________\n{{hr_name}}\n{{hr_designation}}\nHuman Resources\n{{company_name}}' },
    ]},
  },

  // ── SALES ────────────────────────────────────────────────────────
  {
    id: 'sales-quotation',
    name: 'Sales Quotation',
    description: 'Professional sales quotation with itemised pricing, taxes, validity period, and payment terms.',
    industry: 'sales', industryLabel: '💼 Sales',
    output_target: 'pdf',
    tags: ['sales', 'quotation', 'pricing', 'invoice'],
    preview_blocks: ['Company header', 'Client info', 'Quotation meta table', 'Line items table', 'Tax & total summary', 'Payment terms', 'Bank details', 'T&C'],
    layout_json: { blocks: [
      { block_id: 'sqt-1', type: 'text', content: '{{company_name}}\n{{company_address}}\nGST: {{company_gst}} | Phone: {{company_phone}} | Email: {{company_email}}' },
      { block_id: 'sqt-2', type: 'table', columns: [
        { header: 'Quotation No.', binding: '{{quote_number}}' },
        { header: 'Date', binding: '{{quote_date}}' },
        { header: 'Valid Until', binding: '{{valid_until}}' },
        { header: 'Prepared By', binding: '{{prepared_by}}' },
      ]},
      { block_id: 'sqt-3', type: 'text', content: 'Prepared For:\n{{client_name}}\n{{client_address}}\nGST: {{client_gst}} | Contact: {{client_contact}}' },
      { block_id: 'sqt-4', type: 'table', columns: [
        { header: 'S.No.', binding: '{{sl_no}}' },
        { header: 'Description', binding: '{{item_description}}' },
        { header: 'HSN/SAC', binding: '{{hsn_sac}}' },
        { header: 'Qty', binding: '{{quantity}}' },
        { header: 'Unit', binding: '{{unit}}' },
        { header: 'Rate (INR)', binding: '{{unit_rate}}' },
        { header: 'Amount (INR)', binding: '{{amount}}' },
      ], repeat: '{{line_items}}' },
      { block_id: 'sqt-5', type: 'table', columns: [
        { header: 'Subtotal (INR)', binding: '{{subtotal}}' },
        { header: 'CGST (INR)', binding: '{{cgst_amount}}' },
        { header: 'SGST (INR)', binding: '{{sgst_amount}}' },
        { header: 'Total (INR)', binding: '{{total_amount}}' },
      ]},
      { block_id: 'sqt-6', type: 'text', content: 'Amount in Words: {{amount_in_words}}' },
      { block_id: 'sqt-7', type: 'text', content: 'PAYMENT TERMS: {{payment_terms}}\nPAYMENT MODE: {{payment_mode}}\n\nBank Details:\nBank: {{bank_name}} | A/C: {{account_number}} | IFSC: {{ifsc_code}}' },
      { block_id: 'sqt-8', type: 'text', content: 'TERMS AND CONDITIONS:\n1. This quotation is valid for {{validity_days}} days from the date of issue.\n2. Delivery within {{delivery_days}} working days from receipt of confirmed purchase order.\n3. Prices are exclusive of GST unless otherwise mentioned.\n\nFor {{company_name}},\n\n_______________________________\n{{authorised_signatory}}' },
    ]},
  },

  {
    id: 'sales-invoice',
    name: 'Tax Invoice (GST)',
    description: 'GST-compliant tax invoice with full line items, CGST/SGST/IGST breakup, and payment tracking.',
    industry: 'sales', industryLabel: '💼 Sales',
    output_target: 'pdf',
    tags: ['sales', 'invoice', 'gst', 'tax'],
    preview_blocks: ['Seller header', 'Invoice details table', 'Buyer details', 'Line items with GST table', 'Tax summary table', 'Amount in words', 'Declaration'],
    layout_json: { blocks: [
      { block_id: 'sin-1', type: 'text', content: 'TAX INVOICE\n\n{{seller_name}}\n{{seller_address}}\nGSTIN: {{seller_gstin}} | PAN: {{seller_pan}}\nPhone: {{seller_phone}} | Email: {{seller_email}}' },
      { block_id: 'sin-2', type: 'table', columns: [
        { header: 'Invoice No.', binding: '{{invoice_number}}' },
        { header: 'Invoice Date', binding: '{{invoice_date}}' },
        { header: 'Due Date', binding: '{{due_date}}' },
        { header: 'Place of Supply', binding: '{{place_of_supply}}' },
      ]},
      { block_id: 'sin-3', type: 'text', content: 'Bill To:\n{{buyer_name}}\n{{buyer_address}}\nGSTIN: {{buyer_gstin}} | PAN: {{buyer_pan}}' },
      { block_id: 'sin-4', type: 'table', columns: [
        { header: 'Description', binding: '{{item_desc}}' },
        { header: 'HSN/SAC', binding: '{{hsn_sac}}' },
        { header: 'Qty', binding: '{{qty}}' },
        { header: 'Rate', binding: '{{rate}}' },
        { header: 'Taxable Value', binding: '{{taxable_value}}' },
        { header: 'GST%', binding: '{{gst_rate}}' },
        { header: 'GST Amount', binding: '{{gst_amount}}' },
        { header: 'Total', binding: '{{total}}' },
      ], repeat: '{{items}}' },
      { block_id: 'sin-5', type: 'table', columns: [
        { header: 'Taxable Amount', binding: '{{taxable_total}}' },
        { header: 'CGST', binding: '{{cgst_total}}' },
        { header: 'SGST', binding: '{{sgst_total}}' },
        { header: 'IGST', binding: '{{igst_total}}' },
        { header: 'Grand Total', binding: '{{grand_total}}' },
      ]},
      { block_id: 'sin-6', type: 'text', content: 'Amount in Words: {{amount_words}}\n\nPayment Status: {{payment_status}}\nPayment Reference: {{payment_ref}}' },
      { block_id: 'sin-7', type: 'text', content: 'Declaration: We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.\n\nFor {{seller_name}},\n\n_______________________________\nAuthorised Signatory' },
    ]},
  },

  // ── EDUCATION ────────────────────────────────────────────────────
  {
    id: 'education-progress-report',
    name: 'Student Progress Report',
    description: 'Academic progress report covering subject grades, attendance, and teacher remarks per term.',
    industry: 'education', industryLabel: '🎓 Education',
    output_target: 'pdf',
    tags: ['education', 'report', 'academic', 'grades'],
    preview_blocks: ['School header', 'Student info table', 'Attendance table', 'Subject marks table', 'Grade legend', 'Co-curricular activities', 'Teacher & principal remarks'],
    layout_json: { blocks: [
      { block_id: 'epr-1', type: 'text', content: '{{school_name}}\n{{school_address}}\nPhone: {{school_phone}} | Email: {{school_email}}\n\nSTUDENT PROGRESS REPORT\nAcademic Year: {{academic_year}} | Term: {{term}}' },
      { block_id: 'epr-2', type: 'table', columns: [
        { header: 'Student Name', binding: '{{student_name}}' },
        { header: 'Class & Section', binding: '{{class_section}}' },
        { header: 'Roll Number', binding: '{{roll_number}}' },
        { header: 'Admission No.', binding: '{{admission_number}}' },
      ]},
      { block_id: 'epr-3', type: 'table', columns: [
        { header: 'Working Days', binding: '{{working_days}}' },
        { header: 'Days Present', binding: '{{days_present}}' },
        { header: 'Days Absent', binding: '{{days_absent}}' },
        { header: 'Attendance %', binding: '{{attendance_pct}}%' },
      ]},
      { block_id: 'epr-4', type: 'table', columns: [
        { header: 'Subject', binding: '{{subject}}' },
        { header: 'Max Marks', binding: '{{max_marks}}' },
        { header: 'Marks Obtained', binding: '{{marks_obtained}}' },
        { header: 'Grade', binding: '{{grade}}' },
        { header: 'Remarks', binding: '{{subject_remarks}}' },
      ], repeat: '{{subjects}}' },
      { block_id: 'epr-5', type: 'text', content: 'Total: {{total_marks}} / {{total_max_marks}} | Percentage: {{percentage}}% | Overall Grade: {{overall_grade}}\n\nGrade Legend: A1 (91-100) | A2 (81-90) | B1 (71-80) | B2 (61-70) | C (51-60) | D (41-50) | E (Below 40)' },
      { block_id: 'epr-6', type: 'text', content: 'CO-CURRICULAR ACTIVITIES: {{cocurricular_activities}}\nSPORTS / EXTRA-CURRICULAR: {{sports_activities}}' },
      { block_id: 'epr-7', type: 'text', content: "Class Teacher's Remarks: {{teacher_remarks}}\n\nPrincipal's Remarks: {{principal_remarks}}\n\n_______________________          _______________________\nClass Teacher                    Principal\n{{teacher_name}}                  {{principal_name}}\n\nParent's Signature: ___________________________\nDate: ____________" },
    ]},
  },

  {
    id: 'education-bonafide-certificate',
    name: 'Bonafide Certificate',
    description: 'Certificate confirming that a student is enrolled and studying in good standing at the institution.',
    industry: 'education', industryLabel: '🎓 Education',
    output_target: 'pdf',
    tags: ['education', 'bonafide', 'certificate', 'student'],
    preview_blocks: ['Institution letterhead', 'Certificate title', 'Student details table', 'Declaration text', 'Purpose statement', 'Principal signature'],
    layout_json: { blocks: [
      { block_id: 'ebc-1', type: 'text', content: '{{institution_name}}\n{{institution_address}}\nPhone: {{institution_phone}} | Email: {{institution_email}}\nAffiliation: {{affiliation_board}} | Affiliation No.: {{affiliation_number}}' },
      { block_id: 'ebc-2', type: 'text', content: 'BONAFIDE CERTIFICATE\nCertificate No.: {{cert_number}}\nDate of Issue: {{issue_date}}' },
      { block_id: 'ebc-3', type: 'table', columns: [
        { header: 'Student Name', binding: '{{student_name}}' },
        { header: 'Admission No.', binding: '{{admission_number}}' },
        { header: 'Class / Course', binding: '{{class_course}}' },
        { header: 'Academic Year', binding: '{{academic_year}}' },
        { header: 'Date of Birth', binding: '{{dob}}' },
      ]},
      { block_id: 'ebc-4', type: 'text', content: 'TO WHOM IT MAY CONCERN\n\nThis is to certify that {{student_name}}, son/daughter of {{parent_name}}, bearing Admission No. {{admission_number}}, is a bonafide student of this institution, currently studying in {{class_course}} during the Academic Year {{academic_year}}.\n\nHis/Her conduct and character have been {{conduct}} throughout the period of study.' },
      { block_id: 'ebc-5', type: 'text', content: 'This certificate is issued at the request of the student for the purpose of {{purpose}} and shall not be used for any other purpose.' },
      { block_id: 'ebc-6', type: 'text', content: '{{principal_name}}\nPrincipal / Head of Institution\n{{institution_name}}\n\nSignature and Official Seal: ___________________________' },
    ]},
  },

  // ── LOGISTICS ────────────────────────────────────────────────────
  {
    id: 'logistics-delivery-receipt',
    name: 'Delivery Receipt / POD',
    description: 'Proof of delivery with shipment details, items received, condition notes, and receiver acknowledgment.',
    industry: 'logistics', industryLabel: '🚚 Logistics',
    output_target: 'pdf',
    tags: ['logistics', 'delivery', 'pod', 'shipment'],
    preview_blocks: ['Company header', 'Shipment details table', 'Shipper & consignee table', 'Items delivered table', 'Delivery remarks', 'Receiver signature block'],
    layout_json: { blocks: [
      { block_id: 'ldr-1', type: 'text', content: '{{company_name}}\n{{company_address}}\nPhone: {{company_phone}}\n\nDELIVERY RECEIPT - PROOF OF DELIVERY (POD)' },
      { block_id: 'ldr-2', type: 'table', columns: [
        { header: 'AWB / Docket No.', binding: '{{awb_number}}' },
        { header: 'Shipment Date', binding: '{{shipment_date}}' },
        { header: 'Delivery Date', binding: '{{delivery_date}}' },
        { header: 'Delivery Time', binding: '{{delivery_time}}' },
        { header: 'Vehicle No.', binding: '{{vehicle_number}}' },
      ]},
      { block_id: 'ldr-3', type: 'table', columns: [
        { header: 'Shipper Name', binding: '{{shipper_name}}' },
        { header: 'Origin', binding: '{{origin}}' },
        { header: 'Consignee Name', binding: '{{consignee_name}}' },
        { header: 'Destination', binding: '{{destination}}' },
      ]},
      { block_id: 'ldr-4', type: 'table', columns: [
        { header: 'S.No.', binding: '{{sl_no}}' },
        { header: 'Description', binding: '{{item_description}}' },
        { header: 'Qty Dispatched', binding: '{{qty_dispatched}}' },
        { header: 'Qty Received', binding: '{{qty_received}}' },
        { header: 'Condition', binding: '{{condition}}' },
        { header: 'Remarks', binding: '{{item_remarks}}' },
      ], repeat: '{{items}}' },
      { block_id: 'ldr-5', type: 'text', content: 'DELIVERY REMARKS:\n{{delivery_remarks}}\n\nDelivery Person: {{delivery_person}} | Contact: {{delivery_contact}}' },
      { block_id: 'ldr-6', type: 'text', content: 'ACKNOWLEDGEMENT\n\nI hereby confirm receipt of the above goods in the stated condition.\n\nReceived By: ___________________________\nName: {{receiver_name}}\nDesignation: {{receiver_designation}}\nDate and Time: {{delivery_date}} {{delivery_time}}\n\nSignature and Stamp: ___________________________' },
    ]},
  },

  {
    id: 'logistics-waybill',
    name: 'Consignment Waybill',
    description: 'Transport waybill / lorry receipt for goods movement with declared value, route, and freight charges.',
    industry: 'logistics', industryLabel: '🚚 Logistics',
    output_target: 'pdf',
    tags: ['logistics', 'waybill', 'freight', 'transport'],
    preview_blocks: ['Transport company header', 'LR number & date', 'Consignment details table', 'Goods description table', 'Freight charges table', 'E-way bill info', 'Declaration'],
    layout_json: { blocks: [
      { block_id: 'lwy-1', type: 'text', content: '{{transporter_name}}\n{{transporter_address}}\nPAN: {{pan_number}} | GSTIN: {{gstin}}\nPhone: {{phone}}\n\nCONSIGNMENT NOTE / LORRY RECEIPT\nLR No.: {{lr_number}} | Date: {{lr_date}}' },
      { block_id: 'lwy-2', type: 'table', columns: [
        { header: 'Consignor', binding: '{{consignor_name}}' },
        { header: 'Consignor Address', binding: '{{consignor_address}}' },
        { header: 'Consignee', binding: '{{consignee_name}}' },
        { header: 'Consignee Address', binding: '{{consignee_address}}' },
      ]},
      { block_id: 'lwy-3', type: 'table', columns: [
        { header: 'From', binding: '{{origin_city}}' },
        { header: 'To', binding: '{{destination_city}}' },
        { header: 'Vehicle No.', binding: '{{vehicle_number}}' },
        { header: 'Driver Name', binding: '{{driver_name}}' },
        { header: 'Driver DL', binding: '{{driver_dl}}' },
      ]},
      { block_id: 'lwy-4', type: 'table', columns: [
        { header: 'Description of Goods', binding: '{{goods_description}}' },
        { header: 'No. of Packages', binding: '{{packages}}' },
        { header: 'Weight (kg)', binding: '{{weight_kg}}' },
        { header: 'Declared Value (INR)', binding: '{{declared_value}}' },
      ], repeat: '{{goods_items}}' },
      { block_id: 'lwy-5', type: 'table', columns: [
        { header: 'Freight (INR)', binding: '{{freight_amount}}' },
        { header: 'Loading (INR)', binding: '{{loading_charges}}' },
        { header: 'Unloading (INR)', binding: '{{unloading_charges}}' },
        { header: 'GST (INR)', binding: '{{gst_amount}}' },
        { header: 'Total (INR)', binding: '{{total_freight}}' },
      ]},
      { block_id: 'lwy-6', type: 'text', content: 'E-Way Bill No.: {{eway_bill_number}} | Valid Until: {{eway_valid_until}}\nFreight to Be Paid By: {{freight_paid_by}} | Payment Mode: {{payment_mode}}' },
      { block_id: 'lwy-7', type: 'text', content: 'TERMS: Goods are accepted subject to our standard terms and conditions. All disputes subject to {{jurisdiction}} jurisdiction.\n\nFor {{transporter_name}},\n\n_______________________________\nAuthorised Signatory' },
    ]},
  },

];

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRY_FILTERS = [
  { value: '', label: 'All Industries' },
  { value: 'banking',    label: '🏦 Banking' },
  { value: 'insurance',  label: '🛡 Insurance' },
  { value: 'healthcare', label: '🏥 Healthcare' },
  { value: 'legal',      label: '⚖ Legal' },
  { value: 'sales',      label: '💼 Sales' },
  { value: 'education',  label: '🎓 Education' },
  { value: 'logistics',  label: '🚚 Logistics' },
];

const FORMAT_META: Record<string, { bg: string; color: string; icon: string }> = {
  pdf:  { bg: '#fee2e2', color: '#b91c1c', icon: '📄' },
  docx: { bg: '#dbeafe', color: '#1d4ed8', icon: '📝' },
  xlsx: { bg: '#dcfce7', color: '#166534', icon: '📊' },
  html: { bg: '#fef9c3', color: '#854d0e', icon: '🌐' },
  md:   { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', icon: '📋' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrebuiltTemplatesPage() {
  const navigate = useNavigate();
  const [industry, setIndustry]     = useState('');
  const [search, setSearch]         = useState('');
  const [previewId, setPreviewId]   = useState<string | null>(null);
  const [usingId, setUsingId]       = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  // Track which prebuilt templates have already been used (matched by name)
  const [usedNames, setUsedNames]   = useState<Set<string>>(new Set());

  // On mount, fetch all existing templates and mark any whose name matches a prebuilt
  useEffect(() => {
    listTemplates()
      .then((templates) => {
        const names = new Set(templates.map((t) => t.name));
        setUsedNames(names);
      })
      .catch(() => {/* silently ignore — badge is cosmetic */});
  }, []);

  const filtered = PREBUILT_TEMPLATES.filter((t) => {
    const matchIndustry = !industry || t.industry === industry;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q));
    return matchIndustry && matchSearch;
  });

  const previewTemplate = previewId ? PREBUILT_TEMPLATES.find((t) => t.id === previewId) : null;

  async function handleUseTemplate(tmpl: PrebuiltTemplate) {
    setUsingId(tmpl.id);
    setErrorMsg(null);
    try {
      const created = await createTemplate({
        name: tmpl.name,
        description: tmpl.description,
        output_target: tmpl.output_target,
        industry: tmpl.industry,
        tags: tmpl.tags,
        is_prebuilt: true,
      });
      await updateTemplate(created.template_id, {
        name: tmpl.name,
        output_target: tmpl.output_target,
        root_layout_json: tmpl.layout_json.blocks as LayoutBlock[],
        tags: tmpl.tags,
        skip_audit: true,
      });
      setUsedNames((prev) => new Set([...prev, tmpl.name]));
      setSuccessMsg(`"${tmpl.name}" added to your templates!`);
      setTimeout(() => { setSuccessMsg(null); navigate(`/templates/${created.template_id}`); }, 1200);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to create template');
    } finally {
      setUsingId(null);
    }
  }

  const counts: Record<string, number> = {};
  PREBUILT_TEMPLATES.forEach((t) => { counts[t.industry] = (counts[t.industry] ?? 0) + 1; });

  return (
    <div style={S.page}>
      <div style={S.hero}>
        <div style={S.heroLeft}>
          <div style={S.heroIconWrap}>⚡</div>
          <div>
            <h1 style={S.heroTitle}>Prebuilt Templates</h1>
            <p style={S.heroSub}>Ready-made professional templates — preview and use in one click</p>
          </div>
        </div>
        <div style={S.heroBadge}>{PREBUILT_TEMPLATES.length} templates · 7 industries</div>
      </div>

      <div style={S.pillRow}>
        {INDUSTRY_FILTERS.filter((f) => f.value).map((f) => (
          <button key={f.value} style={{ ...S.pill, ...(industry === f.value ? S.pillActive : {}) }}
            onClick={() => setIndustry(industry === f.value ? '' : f.value)}>
            {f.label}<span style={S.pillCount}>{counts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div style={S.filtersBar}>
        <input type="text" placeholder="🔍  Search by name, tag, or keyword..."
          value={search} onChange={(e) => setSearch(e.target.value)} style={S.searchInput} />
        <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={S.select}>
          {INDUSTRY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <span style={S.countText}>{filtered.length} template{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {successMsg && <div style={S.toastSuccess}>✓ {successMsg}</div>}
      {errorMsg   && <div style={S.toastError}>⚠ {errorMsg}</div>}

      {filtered.length === 0 && (
        <div style={S.emptyState}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>No templates found</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Try a different keyword or industry</div>
        </div>
      )}

      <div style={S.grid}>
        {filtered.map((tmpl) => {
          const fmt = FORMAT_META[tmpl.output_target] ?? FORMAT_META.pdf;
          const isUsing = usingId === tmpl.id;
          const isUsed  = usedNames.has(tmpl.name);
          return (
            <div key={tmpl.id} style={{ ...S.card, ...(isUsed ? S.cardUsed : {}) }}>
              <div style={S.cardTop}>
                <span style={{ ...S.fmtBadge, background: fmt.bg, color: fmt.color }}>{fmt.icon} {tmpl.output_target.toUpperCase()}</span>
                {isUsed && (
                  <span style={S.usedBadge}>✓ Used</span>
                )}
                <span style={{ ...S.industryBadge, marginLeft: isUsed ? 0 : 'auto' }}>{tmpl.industryLabel}</span>
              </div>
              <div style={S.cardName}>{tmpl.name}</div>
              <div style={S.cardDesc}>{tmpl.description}</div>
              <div style={S.tagRow}>
                {tmpl.tags.slice(0, 3).map((tag) => <span key={tag} style={S.tag}>{tag}</span>)}
              </div>
              <div style={S.previewHint} onClick={() => setPreviewId(tmpl.id)}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {tmpl.layout_json.blocks.length} blocks
                </span>
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>👁 Preview structure</span>
              </div>
              <div style={S.cardFooter}>
                <button style={S.previewBtn} onClick={() => setPreviewId(tmpl.id)}>Preview →</button>
                <button style={{ ...S.useBtn, ...(isUsed ? S.useBtnUsed : {}), opacity: isUsing ? 0.7 : 1, cursor: isUsing ? 'not-allowed' : 'pointer' }}
                  onClick={() => !isUsing && handleUseTemplate(tmpl)} disabled={isUsing}>
                  {isUsing ? '⟳ Creating...' : isUsed ? '✓ Use Again' : '+ Use Template'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {previewTemplate && (
        <div style={MS.overlay} onClick={() => setPreviewId(null)}>
          <div style={MS.modal} onClick={(e) => e.stopPropagation()}>
            <div style={MS.header}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ ...S.fmtBadge, background: FORMAT_META[previewTemplate.output_target]?.bg, color: FORMAT_META[previewTemplate.output_target]?.color }}>
                    {FORMAT_META[previewTemplate.output_target]?.icon} {previewTemplate.output_target.toUpperCase()}
                  </span>
                  <span style={S.industryBadge}>{previewTemplate.industryLabel}</span>
                </div>
                <h2 style={MS.title}>{previewTemplate.name}</h2>
                <p style={MS.subtitle}>{previewTemplate.description}</p>
              </div>
              <button style={MS.closeBtn} onClick={() => setPreviewId(null)}>✕</button>
            </div>
            <div style={MS.body}>
              <div style={MS.section}>
                <div style={MS.sectionLabel}>Block Structure ({previewTemplate.layout_json.blocks.length} blocks)</div>
                <div style={MS.blockList}>
                  {previewTemplate.preview_blocks.map((block, i) => (
                    <div key={i} style={MS.blockItem}>
                      <span style={MS.blockNum}>{i + 1}</span>
                      <span style={MS.blockText}>{block}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={MS.section}>
                <div style={MS.sectionLabel}>Placeholders ({extractPlaceholders(previewTemplate.layout_json).length} tokens)</div>
                <div style={MS.phGrid}>
                  {extractPlaceholders(previewTemplate.layout_json).map((ph) => (
                    <code key={ph} style={MS.phChip}>{`{{${ph}}}`}</code>
                  ))}
                </div>
              </div>
              <div style={MS.section}>
                <div style={MS.sectionLabel}>Tags</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {previewTemplate.tags.map((tag) => <span key={tag} style={S.tag}>{tag}</span>)}
                </div>
              </div>
            </div>
            <div style={MS.footer}>
              <button style={MS.cancelBtn} onClick={() => setPreviewId(null)}>Close</button>
              <button style={{ ...MS.useBtn, opacity: usingId === previewTemplate.id ? 0.7 : 1 }}
                onClick={() => { setPreviewId(null); handleUseTemplate(previewTemplate); }}
                disabled={usingId === previewTemplate.id}>
                {usingId === previewTemplate.id ? '⟳ Creating...' : '+ Use This Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function extractPlaceholders(layoutJson: { blocks: LayoutBlock[] }): string[] {
  const tokens = new Set<string>();
  const regex = /\{\{([^}]+)\}\}/g;
  function walk(obj: unknown) {
    if (typeof obj === 'string') { for (const m of obj.matchAll(regex)) tokens.add(m[1].trim()); }
    else if (Array.isArray(obj)) { obj.forEach(walk); }
    else if (obj && typeof obj === 'object') { Object.values(obj as Record<string, unknown>).forEach(walk); }
  }
  walk(layoutJson);
  return [...tokens].sort();
}

const S: Record<string, React.CSSProperties> = {
  page:         { padding: '20px 24px', maxWidth: '1160px', fontFamily: 'var(--font-family-sans)' },
  hero:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: 'var(--color-bg-surface)', borderRadius: 18, padding: '16px 22px', border: '1px solid var(--color-border-soft)', boxShadow: 'var(--shadow-md)' },
  heroLeft:     { display: 'flex', alignItems: 'center', gap: 16 },
  heroIconWrap: { fontSize: 24, background: 'var(--color-primary-50)', borderRadius: 12, padding: '8px 10px', lineHeight: 1, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-primary-200)' },
  heroTitle:    { fontSize: 19, fontWeight: 800, color: 'var(--color-text-strong)', letterSpacing: '-0.5px', lineHeight: 1.1 },
  heroSub:      { fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3, fontWeight: 500 },
  heroBadge:    { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, border: '1px solid var(--color-warning-border)' },
  pillRow:      { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  pill:         { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' },
  pillActive:   { background: 'var(--color-primary-50)', border: '1.5px solid var(--color-primary-200)', color: 'var(--color-primary-800)' },
  pillCount:    { background: 'var(--color-primary-100)', color: 'var(--color-primary-800)', borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 800 },
  filtersBar:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  searchInput:  { flex: 1, minWidth: 220, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, color: 'var(--text-primary)', backgroundColor: '#fff', boxShadow: 'var(--shadow-xs)' },
  select:       { padding: '8px 30px 8px 11px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, color: 'var(--text-secondary)', backgroundColor: '#fff', cursor: 'pointer', boxShadow: 'var(--shadow-xs)', fontFamily: 'var(--font-family-sans)' },
  countText:    { fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap', fontWeight: 600 },
  toastSuccess: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: 13, fontWeight: 600 },
  toastError:   { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: 13, fontWeight: 600 },
  emptyState:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', background: 'var(--surface-2)', border: '1.5px dashed var(--border-strong)', borderRadius: 18, textAlign: 'center' },
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 },
  card:         { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-sm)' },
  cardTop:      { display: 'flex', alignItems: 'center', gap: 8 },
  fmtBadge:     { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700 },
  industryBadge:{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', fontSize: 11, padding: '2px 9px', borderRadius: 999, fontWeight: 700, border: '1px solid var(--color-warning-border)', marginLeft: 'auto' },
  cardName:     { fontWeight: 800, fontSize: 14.5, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 },
  cardDesc:     { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55, flexGrow: 1 },
  tagRow:       { display: 'flex', gap: 5, flexWrap: 'wrap' },
  tag:          { background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', fontSize: 10.5, padding: '2px 8px', borderRadius: 999, fontWeight: 700, border: '1px solid var(--color-primary-200)' },
  previewHint:  { display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' },
  cardFooter:   { display: 'flex', gap: 8, marginTop: 4 },
  previewBtn:   { flex: 1, background: 'var(--accent-subtle)', border: '1.5px solid rgba(59,110,248,0.22)', borderRadius: 9, padding: '8px 0', fontSize: 12, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' },
  useBtn:       { flex: 2, background: 'var(--color-primary-800)', border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 12.5, fontWeight: 800, color: '#fff', boxShadow: '0 6px 18px rgba(96,165,250,0.24)' },
  useBtnUsed:   { background: 'var(--color-success-text)', boxShadow: '0 4px 12px rgba(22,101,52,0.18)' },
  usedBadge:    { display: 'inline-flex', alignItems: 'center', gap: 3, background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', color: '#065f46', fontSize: 10.5, padding: '2px 9px', borderRadius: 999, fontWeight: 800, border: '1px solid rgba(5,150,105,0.3)', marginLeft: 'auto' },
  cardUsed:     { borderColor: 'rgba(5,150,105,0.35)', background: 'linear-gradient(160deg, #ffffff 70%, #f0fdf4 100%)', boxShadow: '0 2px 12px rgba(5,150,105,0.10)' },
};

const MS: Record<string, React.CSSProperties> = {
  overlay:      { position: 'fixed', inset: 0, backgroundColor: 'rgba(5,13,26,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(8px)', padding: 20 },
  modal:        { background: '#fff', borderRadius: 22, width: 580, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 72px rgba(5,13,26,0.28)', border: '1px solid rgba(245,158,11,0.2)' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', background: 'var(--color-bg-elevated)', borderRadius: '22px 22px 0 0' },
  title:        { fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.4px' },
  subtitle:     { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5, maxWidth: 460 },
  closeBtn:     { background: 'rgba(148,163,184,0.12)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', padding: '7px 9px', borderRadius: 8, fontFamily: 'var(--font-family-mono)', flexShrink: 0 },
  body:         { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 },
  section:      { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionLabel: { fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' },
  blockList:    { display: 'flex', flexDirection: 'column', gap: 6 },
  blockItem:    { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)', borderRadius: 8, padding: '7px 12px', border: '1px solid var(--border)' },
  blockNum:     { background: 'rgba(245,158,11,0.15)', color: '#92400e', borderRadius: 999, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, flexShrink: 0 },
  blockText:    { fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 },
  phGrid:       { display: 'flex', flexWrap: 'wrap', gap: 6 },
  phChip:       { background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', fontSize: 11, padding: '3px 9px', borderRadius: 6, fontFamily: 'var(--font-family-mono)', fontWeight: 600, border: '1px solid var(--color-primary-200)' },
  footer:       { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: '0 0 22px 22px' },
  cancelBtn:    { background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, padding: '9px 18px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-family-sans)' },
  useBtn:       { background: 'var(--color-primary-800)', border: 'none', borderRadius: 10, padding: '9px 22px', fontSize: 13, fontWeight: 800, color: '#fff', cursor: 'pointer', boxShadow: '0 6px 18px rgba(96, 165, 250, 0.24)', fontFamily: 'var(--font-family-sans)' },
};
