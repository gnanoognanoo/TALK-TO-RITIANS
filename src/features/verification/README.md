# Feature: College Identity Verification

Primary Owner: **Person A (Scanner UI)** & **Person B (Verification & Linking Logic)**

Scope:
- Browser camera QR scanner viewport (`html5-qrcode`)
- Loading, permission denied, and scan error states
- Parsing via `src/utils/qrParser.ts`
- Account linking invocation (`linkCollegeIdentity`)
- Enforcing single account per college ID
