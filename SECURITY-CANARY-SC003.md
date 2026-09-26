# Secret-scan negative-test canary (SC-003)

This file exists ONLY to verify that the `secret-scan` CI job fails a PR
whose diff contains a secret-shaped string. It will be closed without
merging and deleted.

Fake credential below — a hand-built placeholder matching the GitHub PAT
shape (ghp_ + 36 alphanumerics), spelled FAKE repeated; never a real
credential:

    ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE
