# Mindlock sample: node

A tiny notes app used to test deploys on a Mindlock server. It follows the Mindlock app contract: a Dockerfile at the root, port 8080, non-root, read-only filesystem, MongoDB at host `database` (password in `/run/secrets/db_password`). The `check` workflow runs it under the same limits.
