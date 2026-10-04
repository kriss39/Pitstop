#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { getBalance, totalUsd, TIP20_DECIMALS } from '@pitstop/sdk'
import { formatUnits, isAddress } from 'viem'
import { z } from 'zod'

const server = new McpServer({ name: 'pitstop', version: '0.0.0' })

server.registerTool(
  'get_balance',
  {
    title: 'Get agent balance',
    description: "Read the agent's stablecoin balances on Tempo (chain 4217).",
    inputSchema: {
      address: z
        .string()
        .refine((value) => isAddress(value), 'Must be a 0x-prefixed EVM address')
        .describe('Tempo address of the agent'),
    },
  },
  async ({ address }) => {
    const balances = await getBalance({ address: address as `0x${string}` })
    const result = {
      address,
      totalUsd: formatUnits(totalUsd(balances), TIP20_DECIMALS),
      balances: balances.map(({ symbol, token, formatted }) => ({ symbol, token, amount: formatted })),
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

await server.connect(new StdioServerTransport())
