# Template media upload: audit and verification

The upload path preserves binary framing, supports bounded opaque session IDs,
propagates cancellation, and records sanitized Meta failures. No credentials,
authorization rules, Graph version, template publication or deployments changed.

## Findings and evidence

- **High: binary corruption.** `multipart.ts` split on bare `--boundary`, even
  inside file data. A regression reproduces 28 original bytes becoming 10.
  Delimiters now require MIME line framing and a valid suffix; incomplete bodies
  are rejected instead of forwarding truncated files. Latin1 conversion itself
  is byte-preserving and was not the defect. The helper is shared with messaging,
  OCR and campaigns; existing consumers must remain covered by the full suite.
- **Medium: overly restrictive session validation.** The old session regex
  accepted only URL-safe characters and trailing padding. Tests demonstrate
  rejection of standard base64 `+`/`/` and a signed `?sig=...` suffix. The current
  official guide specifies `upload:<UPLOAD_SESSION_ID>` but no formal alphabet.
  These are synthetic compatibility cases, not a captured response from the
  configured account. Only bounded tokens and one optional signature are
  accepted; tokens are encoded as one path segment. Arbitrary URLs, traversal,
  extra query parameters, fragments, whitespace and percent escapes are rejected.
- **Medium: incomplete cancellation.** Browser abort/unmount did not cancel
  the backend's Meta fetch. The route now propagates connection closure to both
  stages. An explicit cancel control recovers the form without permitting an old
  response or finalizer to overwrite a newer upload. Same-file retries work.
- **Medium: upstream error classification.** A binary HTTP 429 was reported as
  an invalid handle with 502; malformed session JSON could escape as a 500.
  HTTP failures now have controlled `META_ERROR` responses, retaining 429 and
  otherwise using the existing upstream 502 convention. The actual upstream
  status, numeric code/subcode and bounded trace ID appear in structured logs.
  No raw error messages, responses, URLs, filenames, tokens, signatures, handles
  or file bytes are logged. Existing management error-user messages are preserved.

The pre-existing raw Response debug statement disappeared from the working tree
before source edits; it was not restored. Unrelated `.atl` edits are excluded.

## End-to-end contract

1. `TemplateForm` selects a local File. The browser's MIME hint/accept filter is
   not trusted by the backend. The form applies 5 MiB image / 16 MiB MP4/PDF limits.
2. `templatesApi.uploadSample` appends the File under `file` to `FormData`.
   `apiClient` attaches the application's Bearer JWT and AbortSignal, not JSON
   serialization or a manual multipart Content-Type. The browser supplies the
   boundary. Its existing 401 token-refresh behavior is unchanged.
3. `POST /templates/:lineId/samples` retains authentication and both existing
   permission gates; `express.raw` limits the whole body to 17 MiB. The parser
   extracts the original bytes. The service checks nonempty size, allowed MIME
   and minimal PNG/JPEG/PDF/MP4 magic signatures before contacting Meta.
4. The existing per-line resolver uses `allowDefault: false`, its configured
   server-side access token, numeric WABA ID and numeric Meta App ID. Session
   creation uses `POST /<APP_ID>/uploads` with encoded filename, byte count and
   MIME; it does not use the WABA or phone-number ID. The upload uses OAuth auth,
   `file_offset: 0` and raw Uint8Array bytes. No automatic write retry is added.
5. Meta's final `h` is an asset handle, not the `upload:...` session ID. Existing
   handle validation remains in force. The frontend stores the handle in the
   form, and `buildTemplatePayload` emits
   `{"type":"HEADER","format":"IMAGE","example":{"header_handle":["4::..."]}}`.
6. Creation submits components to `/<WABA_ID>/message_templates`. Editing first
   checks WABA ownership, then submits components to `/<TEMPLATE_ID>`. Successful
   upload/creation is not proof of template approval; Meta reviews asynchronously.

Message sending is different: `/<PHONE_NUMBER_ID>/media` returns a media **ID**,
used in message media parameters (or a supported link), not `header_handle`.
An approval sample is not automatically attached to later outbound messages.

## Coverage and limitations

Focused suites cover special/malicious session IDs, byte equality, JPEG/PNG/MP4/
PDF signature-level transport, wrong MIME/signature/empty/oversized input,
`header_handle`, 400/401/403/413/429/500/503 in both stages, non-JSON failures,
browser cancellation/unmount/late completion, and real local HTTP disconnects.
Payload fixtures with minimal signatures do **not** prove image/video decoding.
Full document/image/container decoding, codec validation and malware scanning
remain outside the current architecture; Meta may reject a corrupt file that
passes local magic-byte checks. Existing local PDF limit remains 16 MiB.

Cancellation is best effort: it stops local requests, not an upload Meta already
accepted. Interrupted sessions are not persisted/resumed by this application;
a user retry starts a new session. No automatic retry is safe to infer for
template publication, authentication/permission failures or rate limits.

## Real-account verification (operator only)

This procedure is documentation, not authorization to run it. Do not print or
paste secrets in shell history, logs, screenshots or bug reports.

1. Use an explicitly authorized test account/line and the existing credential
   store. Confirm the App ID belongs to the token's app, the WABA is assigned to
   the token's user/system user, and the line's phone-number ID belongs to that
   WABA. Check token expiry and `whatsapp_business_management` for template
   management. Message sending separately requires `whatsapp_business_messaging`.
   Inspect these privately in Meta's dashboard/token debugger; none were verified
   against a live account in this audit. App Secret remains resolver-required
   but is not transmitted by this upload flow.
2. In the local form upload known-good JPEG, PNG, H.264/AAC MP4 and PDF samples
   below local limits. Expect a successful sample registration; inspect only
   sanitized status/code/subcode/trace metadata. Do not export a raw HAR because
   it contains auth headers, signed IDs and file content.
3. Cancel a throttled upload, retry the same file, switch header type after
   cancellation and verify no previous sample returns. Repeat in the edit form.
4. Verify the outgoing components locally with mocks: `header_handle` must be
   an array containing the returned asset handle, never an upload session ID,
   URL or message media ID. **Stop before Publish/Save** unless separately
   authorized to create/edit a real test template.
5. Only with that separate permission, submit the test template and inspect
   Meta's final status/rejection reason. Upload success is not approval. Do not
   send a message or deploy as part of this check without separate authorization.

## Sources

- [Meta Resumable Upload API](https://developers.facebook.com/docs/graph-api/guides/upload/)
- [Meta template media and header_handle](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-media)
- [Meta message media upload](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media)
- Existing architecture: [WhatsApp templates](plantillas-whatsapp.md).

The public upload guide currently shows v26.0 examples. The application's
configurable default remains v23.0; no upgrade was necessary to fix framing.

## Changed files and observed checks

Runtime changes: `backend/src/utils/multipart.ts`,
`backend/src/services/templates/template-management.service.ts`,
`backend/src/routes/templates.routes.ts`, and
`frontend/components/templates/TemplateForm.tsx`. The API client, templates API
and template schema were inspected and left unchanged.

Regression tests: backend `multipart.test.ts`, `template-media-upload.test.ts`
(new), `template-stream.test.ts`, `independent-legacy-graph-contract.test.ts`
(new); frontend `TemplateForm.test.tsx` and
`lib/__tests__/api-client-form-data.test.ts`. Documentation: this audit and
`odd/tasks/template-media-upload.md`; the existing Spanish guide
`docs/plantillas-whatsapp.md` accompanies each behavior commit. Unrelated
registry/OCR edits are excluded.

- RED: initial backend regression run had 16 failures / 21 passes; explicit
  browser cancellation and HTTP disconnect tests also failed before their fixes.
- Final focused backend command: `pnpm --dir backend test --runTestsByPath
src/__tests__/unit/template-media-upload.test.ts src/__tests__/unit/multipart.test.ts
src/__tests__/unit/template-management.test.ts src/__tests__/unit/template-stream.test.ts
src/__tests__/unit/independent-legacy-graph-contract.test.ts` — 5 suites, 72 passed.
- Final focused frontend command: `pnpm --dir frontend exec vitest run
components/templates/TemplateForm.test.tsx components/templates/templates.test.tsx
lib/__tests__/api-client-form-data.test.ts` — 3 files, 16 passed.
- Full frontend: `pnpm --dir frontend exec vitest run` — 108 files, 665 passed.
- Full backend: `pnpm --dir backend test` — 161 suites passed, 1 failed,
  1 skipped; 1,638 tests passed, 1 failed, 2 skipped. The unrelated failure
  reproduced identically in isolated baseline and candidate copies.
- `pnpm --dir backend typecheck`, `pnpm --dir backend typecheck:test` and
  `pnpm --dir frontend exec tsc --noEmit --incremental false` — passed, including
  after the correction below. Full backend/frontend lint passed. A subsequent
  targeted backend ESLint run without the repository's heap option exhausted
  memory; repeating with its configured 6,144 MiB heap passed, as did targeted
  frontend ESLint and `git diff --check`.
- Independent isolated probes covered all byte values, signed IDs, rejection
  without downstream requests, legacy multipart output and cancellation. They
  found an unrequested listing error-status change (500 to 502); one bounded
  correction restricted JSON recovery to uploads. The retained HTTP regression
  now passes; independent recheck: 1/1. Full suites above predate this correction;
  focused checks and types cover the corrected snapshot.
- Isolation caveat: initial verifier `pnpm` invocations unexpectedly resolved
  packages, touched a shared package store and redirected 135 ignored dependency
  links plus 33 launchers into scratch. Removing scratch exposed broken tool
  paths. The parent restored all links/launchers to their exact already-existing
  local package targets without installing or changing versions. Both module
  metadata files contained no scratch reference. No tracked workspace files
  changed. Final recovery checks used direct executables: backend 72/72,
  frontend 16/16, all three typechecks and targeted backend ESLint passed again.
  All reported scratch directories were removed; shared caches were not deleted.
- Not performed: production builds, live token inspection, live media approval,
  message sending, deployment or publication. PostgreSQL-specific tests were
  not started; the full backend runner itself reported the skips above.

Risk: items 2 (session URL guards), 3 (shared multipart behavior), and 4
(cancellation ordering). Independent verification and the scoped recheck are
complete; real-account acceptance remains unverified.

## Local delivery chain

The user selected **stacked-to-main**. These are local branch boundaries, not
published PRs. Each future PR targets `main` only after its predecessor has been
integrated, so its diff contains only that slice. No merge or publication was run.

1. `fix/template-media-01-multipart` — `4a61781`, 55 authored lines: parser,
   regression tests and documentation.
2. `fix/template-media-02-meta-upload` — `13d8f41`, 399 authored lines: safe
   sessions, diagnostics, server cancellation, tests and documentation.
3. `fix/template-media-03-form-cancellation` — `b571f58`, 163 authored lines:
   form cancellation, transport/stale-result tests and documentation.
4. `fix/template-media-04-audit` — final audit and recovery log only.

Every behavior slice keeps tests/docs together. Functional and independent
verification covered the feature before slicing; the frontend commit hook was
confirmed byte-convergent. No source changed during commit organization. A
future publisher must recheck each PR's base/range after predecessor integration;
there is no tracker PR or feature-branch-targeted PR chain.
