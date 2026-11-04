# codex-action final-message readback PoC

This test repository contains a deterministic GitHub Actions reproduction for
the `openai/codex-action@v1` temporary output path readback issue.

The workflow uses only synthetic data. It does not require or transmit a real
OpenAI API key, GitHub secret, customer file, or other credential. A local mock
Responses API tells Codex CLI 0.166.0 to perform three deterministic actions:

1. Attempt to read a synthetic runner-private file directly. The custom Codex
   permission profile must block this negative control.
2. Start a bounded watcher for the action-created temporary `output.md`. Once
   Codex writes its real final message, preserve that file and replace its
   pathname with a symbolic link to the same synthetic file. The profile
   permits writes only in temporary directories and keeps the isolated working
   directory read-only.
3. Return `SAFE_FINAL_MESSAGE` as the actual model final message.

The workflow then verifies that the action's `final-message` output contains
the synthetic runner-private marker instead of `SAFE_FINAL_MESSAGE`. A matrix
runs the reproduction on two independent GitHub-hosted Ubuntu runners.

Run `.github/workflows/poc-final-message-readback.yml` with `workflow_dispatch`.
