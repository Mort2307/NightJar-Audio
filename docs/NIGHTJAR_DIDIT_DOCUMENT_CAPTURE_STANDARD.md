# NightJar identity document capture standard

**Applies to:** members completing age assurance through the NightJar / Didit hosted verification flow.

## Member capture requirements

Use an original, current, physical identity document accepted by the NightJar verification workflow. The member must photograph the physical document directly during the live Didit flow.

Do not use:
- Screenshots, screen photographs, photocopies, printouts or scans.
- A photograph of a document displayed on another device.
- Edited, filtered, digitally enhanced or cropped document images.
- Expired documents, or document types that are not accepted by the active workflow.

For a successful capture:
1. Use bright, even natural light. Avoid harsh glare, reflections and shadows.
2. Place the document flat on a plain, darker surface.
3. Keep all four corners and the entire document inside the frame.
4. Remove plastic sleeves and wallet covers.
5. Clean the camera lens, hold the phone steady and wait for focus.
6. Capture both sides when Didit requests them.
7. Keep machine-readable lines, document numbers, dates and security features unobstructed.
8. Use the device's normal browser and grant camera permission. Avoid in-app browsers if camera access fails.

Accepted document types vary by country and by the live workflow configuration. NightJar must not promise that a particular document type is accepted unless it is enabled in that workflow.

**Enforcement setting to verify in Didit:** configure the ID Verification step to allow live camera capture only (`CAMERA_SCAN`) and disable the file-upload path (`UPLOAD`) if the active workflow and member-device support permit it. This is a Didit workflow setting; NightJar's on-screen instructions alone cannot technically prevent a user from selecting an upload. Do not claim camera-only enforcement until the live workflow configuration has been checked.

## How NightJar explains a failed check

NightJar reads the existing, account-bound Didit decision server-side. It may show a member-facing explanation only from a fixed allowlist of known warning codes. It must never expose provider payloads, extracted identity data, date of birth, document numbers, image URLs, biometrics or raw provider warning text.

Known document warning examples include `IMAGE_TOO_BLURRY`, `IMAGE_TOO_DARK`, `IMAGE_TOO_BRIGHT`, `DOCUMENT_EXPIRED`, `MRZ_VALIDATION_FAILED`, `NFC_DATA_DOES_NOT_MATCH_OCR`, and `COULD_NOT_RECOGNIZE_DOCUMENT`. The last can indicate an unreadable required field, a missing required side, or a document subtype not enabled in the workflow; support must distinguish a member capture issue from a workflow allowlist issue.

The member explanation must contain:
- What part of the check needs attention.
- Why that issue prevents the check from completing.
- The exact corrective action.
- Whether the member should retake the document or wait for NightJar support.

If the warning is unknown, the result is ambiguous, the ID step is already approved, or documentary 18+ evidence is missing, NightJar must not guess or invite another document upload. The case goes to support / configuration review.

## Resubmission and navigation

A NightJar administrator may authorise one eligible failed documentary OCR node in the member's existing Didit session. The member then follows the refreshed, verified Didit session URL. Didit receives only the selected node for resubmission, so the member repeats that step rather than restarting the entire workflow.

Didit controls its hosted flow's internal navigation. NightJar can select the step and link to the same session, but must not invent URL fragments or claim it can deep-link to an internal screen unless Didit documents that capability.

## NightJar safety rules

- A successful document capture is not itself an 18+ approval.
- Only the verified, signed and account-bound result path may unlock 18+ access.
- Do not create a second session to recover a declined or ambiguous existing result.
- Do not resubmit an already-approved ID step just because age evidence is missing.
- Never store ID photographs, document numbers, date of birth, biometrics or raw decision payloads in NightJar's resubmission records.
- Keep provider resubmission owner-authorised, one-shot, bounded and auditable.
- Explain possible provider charges to the administrator before approving a provider mutation.

## Operational references

- Didit document capture guidance: https://help.didit.me/documents-coverage/document-upload-problems
- Didit failed verification guidance: https://help.didit.me/end-users/verification-failed
- Didit resubmission and session status guidance: https://help.didit.me/verification-sessions/retry-a-verification
- Didit update session status API: https://docs.didit.me/sessions-api/update-status
