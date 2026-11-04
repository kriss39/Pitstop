# Changelog

## 0.1.2

- `keystore()` defaults to `./.pitstop` if it exists, otherwise `~/.pitstop` (`PITSTOP_DIR` still wins), matching `@getpitstop/mcp` 0.1.2. The new `defaultKeystoreDir()` returns that folder.
- The keystore folder is created with mode 700; key files stay mode 600.
- Works with mppx 0.17.

## 0.1.1

- First public release under the `@getpitstop` scope.
