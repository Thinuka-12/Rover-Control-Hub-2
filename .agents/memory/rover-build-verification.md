---
name: Rover build verification
description: Environment-specific verification note for the rover-control Vite artifact.
---

The rover-control Vite configuration intentionally fails a direct build unless both `PORT` and `BASE_PATH` are provided. Use the artifact workflow for normal previews; for a manual build, provide the workflow values explicitly.

**Why:** The managed workflow injects these values, while a shell-launched build does not, and the resulting failure can otherwise be mistaken for a code regression.

**How to apply:** Verify the artifact with its configured port and base path rather than changing the Vite configuration or creating a duplicate workflow.