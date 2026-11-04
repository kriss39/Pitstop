# Changelog

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
