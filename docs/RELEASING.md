# Releasing

Releases are automated. Pushing to `main` runs `.github/workflows/ci.yml`,
which cuts a version with semantic-release when the commits since the last tag
warrant one. Nothing is published to a registry — `@semantic-release/npm` runs
with `npmPublish: false`, so a release is a git tag, a GitHub release and a
`CHANGELOG.md` entry.

`src/components/Footer.astro` imports `version` from `package.json`, so the
release number is visible on every page.

## Breaking-change footers are not used here

`!` after the type, or a `BREAKING CHANGE:` footer, makes commit-analyzer cut a
major. Do not use either in this repo.

Nothing consumes this site. There is no dependent to break, so a major
communicates nothing and only inflates the number in the footer. Changes that
would be breaking elsewhere — a moved URL, a dropped page, a different hosting
model — get described in the commit body and land as a `feat` or `fix`.

This is not hypothetical. In September 2026 an upgrade carrying two such
footers released 3.0.0, 3.0.1 and 4.0.0 in an afternoon for what was one
feature and two fixes. The tags and releases were deleted and the work
collapsed into 2.1.0.

## How the analyser reads history

commit-analyzer looks at **every commit since the last tag**, not the newest
one, and takes the highest bump it finds. Two consequences:

- Deleting a tag does not remove the commits it covered from the next
  calculation. To take a range out of scope, put a tag after it.
- An empty commit cannot lower a version. If an earlier commit in the range
  asks for a major, a later `feat` is ignored as the lesser bump.

## Correcting a version

1. Delete the GitHub releases first — they outlive their tags.
2. Delete the tags, locally and on the remote.
3. Tag the intended version at the current tip and push that tag **before**
   pushing anything else, so the next CI run cannot recompute from an older
   tag.
4. Realign `package.json` and `CHANGELOG.md` in a `chore(release): <version>`
   commit. A `chore` subject does not itself cut a release.
