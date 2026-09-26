# Secret-scan negative-test canary (SC-003)

This file exists ONLY to verify that the `secret-scan` CI job fails a PR
whose diff contains a secret-shaped string. It will be closed without
merging and deleted.

Fake credential below — AWS's official documentation example key, never a
real credential:

    aws_access_key_id = AKIAIOSFODNN7EXAMPLE
