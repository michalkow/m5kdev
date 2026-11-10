name: Promotion PR

# A Promotion PR moves tested code to the next Deployment environment's branch.
# Only the expected source branch may open one, so feature branches never land
# on a release branch directly. Merge Promotion PRs with a merge commit.
on:
  pull_request:
    branches:
      - production

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Require the expected source branch
        run: |
          case "$GITHUB_BASE_REF" in
            production) expected=main ;;
            *) echo "No promotion rule for $GITHUB_BASE_REF." >&2; exit 1 ;;
          esac
          if [ "$GITHUB_HEAD_REF" != "$expected" ]; then
            echo "Promote into $GITHUB_BASE_REF only from $expected (this PR is from $GITHUB_HEAD_REF)." >&2
            exit 1
          fi
