# Production Notes

`agent-mailbox` can run on Cloud Run from the committed Dockerfile, but the current v0.1.0 storage backend is an on-disk JSON state file. That is acceptable for smoke testing and single-instance demos. It is not durable production storage on serverless platforms.

For a real deployment, replace the JSON store with SQLite on a persistent VM volume or implement the Postgres path promised in the spec.

Outbound delivery uses real SMTP when `SMTP_HOST`, `SMTP_USER`, and the configured password env var are present. Without provider credentials, the dispatcher returns a mock provider id so policy and approval workflows can be tested without sending live email. Do not treat mock-dispatch e2e as deliverability proof.

Cloud Run note: exact `/healthz` requests to the public `run.app` URL returned a Google frontend 404 during production testing, while application routes and `/readyz` reached the container. The app exposes `/health` as a hosted health alias and keeps `/healthz` for local/self-hosted environments.
