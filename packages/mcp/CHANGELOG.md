# Changelog

## 0.1.3

Security release after a red-team review. Update if you run 0.1.2 or older.

- **Breaking:** a `./.pitstop` folder in the working directory is no longer used on its own. A cloned repo could ship one with a key its author holds. The keystore is `~/.pitstop`; set `PITSTOP_DIR` to use another folder on purpose. The server logs a notice when it skips a `./.pitstop`.
- `fuel_agent` holds a lock in the keystore, so two MCP servers sharing it (say Claude and Cursor) can't refuel at once and overshoot `REFILL_MAX_PER_DAY`. A corrupt `refill-state.json` stops refuels instead of resetting the cap.
- Text from LI.FI and the MPP directory is trimmed and cleaned before it reaches the model; `list_mpp_services` marks entries as third-party data and drops non-https URLs. LI.FI's error text is no longer passed on, only its status.
- `PITSTOP_URL` must be https (http only for localhost).
- Uses `@getpitstop/sdk` 0.1.2: the LI.FI calldata itself is checked (receiver and destination chain), lossy routes are refused, the keystore folder is mode 700 and key files are written without following symlinks.

## 0.1.2

- `npx -y @getpitstop/mcp key` creates the agent's access key and prints the Guard link; `key --new` replaces a revoked one. `home-wallet` creates the Base wallet for `fuel_agent`. No repo clone needed anymore.
- The keystore defaults to `~/.pitstop` when there is no `./.pitstop`, so the server finds keys wherever the MCP client starts it. `PITSTOP_DIR` still overrides it.
- `key_status` shows which payees the key may pay, says `unlimited` for keys without a limit, and gives the Guard link for keys not authorized yet.
- `list_mpp_services` only returns services that take Tempo payments.
- `fuel_quote` and `fuel_agent` take 0.01 to 5 USDC; tiny amounts no longer fail with a LI.FI validation error.
- The server reports its real version to MCP clients (it said 0.1.0).
- Setup errors name the npx command to run instead of repo scripts; an unknown `AGENT_TOKEN` logs a warning.

## 0.1.1

- First public release under the `@getpitstop` scope.
