# INE OCR Google credentials

The INE OCR worker uses two separate authentication boundaries. Set `INE_OCR_ENABLED=true` only after both are configured.

## Document AI

Document AI uses Application Default Credentials (ADC) from the workload identity or managed runtime. It does not read application-provided private keys or service-account JSON.

| Variable                   | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT_ID`  | Google Cloud project containing the processor. |
| `DOCUMENT_AI_LOCATION`     | Processor location, for example `us` or `eu`.  |
| `DOCUMENT_AI_PROCESSOR_ID` | Document AI processor identifier.              |

Grant the runtime identity permission to invoke that processor. The resource is built as `projects/{project}/locations/{location}/processors/{processor}`.

### GCP deployment mapping

The Cloud Run workflow supplies these values as follows:

- `GOOGLE_CLOUD_PROJECT_ID`: the deployment project (`GCP_PROJECT_ID`).
- `DOCUMENT_AI_LOCATION`: the GitHub Actions variable `GCP_DOC_AI_LOC`.
- `DOCUMENT_AI_PROCESSOR_ID`: the Secret Manager secret
  `DOCUMENT_AI_PROCESSOR_ID`, mounted into both `nexo-api` and `nexo-worker`.

`GCP_DOC_AI_PROC` is not consumed by the current workflow. Before enabling OCR,
verify that the `DOCUMENT_AI_PROCESSOR_ID` secret has a non-empty version and is
present in the `nexo-worker` secret environment mapping. A missing value fails the
job with `DOCUMENT_AI_CONFIGURATION_MISSING`; the worker validates this before
downloading the source file from Drive.

## Personal Google Drive

Google Drive uses the personal account's OAuth 2.0 refresh token. The OAuth client must be authorized for the folder below with Drive file access.

| Variable                     | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `GOOGLE_DRIVE_FOLDER_ID`     | Personal Drive folder that owns uploaded INE files. |
| `GOOGLE_OAUTH_CLIENT_ID`     | OAuth 2.0 client identifier.                        |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0 client secret.                            |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Refresh token for the personal Drive account.       |

Keep credentials and processor identifiers in the deployment secret store. Project and
location may remain non-secret deployment variables. Do not place credential values in
tracked files or application logs.

To obtain `GOOGLE_DRIVE_REFRESH_TOKEN`, register `http://localhost:3000/oauth2callback` as an authorized redirect URI on the OAuth client, then from `backend/`:

```bash
pnpm generate:drive-token
```

The helper reads only `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` from `backend/.env`. It does not load the full application env schema.

## Migration behavior

New files persist the personal Drive provider, file object ID, and folder ID. The migration makes historical location metadata nullable without changing existing rows. Records created with an unsupported historical storage provider fail with `INE_STORAGE_PROVIDER_UNSUPPORTED`; they are never interpreted as personal Drive files.
