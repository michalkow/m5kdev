name: Promotion PR

# A Promotion PR moves tested code to the next Deployment environment's branch.
# Only the expected source branch may open one, so feature branches never land
# on a release branch directly. Merge Promotion PRs with a merge commit.
on:
  pull_request:
    branches:
      # m5k:env-staging:start
      - staging
      # m5k:env-staging:end
      # m5k:env-canary:start
      - canary
      # m5k:env-canary:end
      - production

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Require the expected source branch
        env:
          # A branch name alone is not enough: a fork can name its branch `main`.
          HEAD_REPO: ${{ github.event.pull_request.head.repo.full_name }}
        run: |
          if [ "$HEAD_REPO" != "$GITHUB_REPOSITORY" ]; then
            echo "Promotion PRs must come from a branch of $GITHUB_REPOSITORY, not from a fork ($HEAD_REPO)." >&2
            exit 1
          fi
          # Promotion chain: each branch is promoted from the one before it.
          chain="main"
          # m5k:env-staging:start
          chain="$chain staging"
          # m5k:env-staging:end
          # m5k:env-canary:start
          chain="$chain canary"
          # m5k:env-canary:end
          chain="$chain production"
          expected=
          previous=
          for branch in $chain; do
            if [ "$branch" = "$GITHUB_BASE_REF" ]; then expected=$previous; break; fi
            previous=$branch
          done
          if [ -z "$expected" ]; then
            echo "No promotion rule for $GITHUB_BASE_REF." >&2
            exit 1
          fi
          if [ "$GITHUB_HEAD_REF" != "$expected" ]; then
            echo "Promote into $GITHUB_BASE_REF only from $expected (this PR is from $GITHUB_HEAD_REF)." >&2
            exit 1
          fi
