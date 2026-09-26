# Secret-scan negative-test canary (SC-003)

This file exists ONLY to verify that the `secret-scan` CI job fails a PR
whose diff contains a secret-shaped string. It will be closed without
merging and deleted.

Fake credential below — a hand-built placeholder matching the GitHub
fine-grained PAT shape, spelled with AAAA/1111/BBBB/2222 blocks so it is
obviously non-real. Never a credential:

    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77
