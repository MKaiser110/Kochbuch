# Repository instructions

- For every application code change, increment the app version in `package.json` with `npm version patch --no-git-tag-version` (or use `minor`/`major` when appropriate). Keep `package-lock.json` in sync.
- The version shown in the backup menu is read directly from `package.json`.
- Increment `CACHE_NAME` in `sw.js` for each application code release so installed PWAs refresh their offline cache.
