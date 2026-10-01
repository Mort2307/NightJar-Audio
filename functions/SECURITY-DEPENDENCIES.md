# Functions dependency security review

Last reviewed: 2026-10-01

## Known upstream advisory

Nightjar Functions currently inherits **GHSA-w5hq-g745-h8pq** through the official Firebase Admin / Google Cloud Storage dependency tree:

`firebase-admin@14.5.0 -> @google-cloud/storage@8.2.0 -> gaxios@6.7.1 -> uuid@9.0.1`

The advisory is moderate severity and affects the `uuid` v3/v5/v6 APIs when caller-provided output buffers are used with invalid bounds.

Nightjar does not directly depend on `uuid`. The reviewed `gaxios@6.7.1` source imports `uuid.v4()` for multipart request boundary generation. It does not call the affected v3/v5/v6 buffer APIs on that path.

Nightjar also genuinely uses `firebase-admin/storage` for moderated profile images, branding and release artwork, so removing the Storage dependency is not a valid mitigation.

## Engineering decision

- Do **not** use an unsupported major-version `uuid` override beneath `gaxios@6`.
- Do **not** downgrade Firebase Admin to make the audit output disappear.
- Keep Firebase Admin and Google Cloud dependencies current.
- Allow only this specifically reviewed advisory in the automated production dependency audit guard.
- Any additional moderate, high or critical production advisory must fail the guard and be reviewed.
- Revisit this exception as soon as the official Firebase Admin / Google Cloud Storage dependency chain removes the vulnerable version.

## Install-script policy

The Functions project explicitly permits only the reviewed install scripts currently required by its official dependency tree:

- `@firebase/util@1.15.3`
- `protobufjs@7.6.6`

Approvals are pinned to exact reviewed versions. New versions must be reviewed again rather than inheriting blanket script permission.
