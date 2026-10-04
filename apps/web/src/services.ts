// MPP services on Tempo, keyed by the address they're paid at. Collected from the services'
// own 402 challenges (mpp.dev directory, 2026-10-04). Shared gateways collect for many
// services, so a payment to one of them can only be labelled with the gateway's name.

export type Service = { name: string; icon?: string; note?: string }

export const SERVICES: Record<string, Service> = {
  '0xb83df53f396a4522b5755923fe45018ef07cc92b': { name: 'Nansen', icon: '/services/nansen.png' },
  '0xc12b5d802da90d14a8b35dec1cfb6fd5ceede60b': { name: 'Codex', icon: '/services/codex.png' },
  '0xca4e835f803cb0b7c428222b3a3b98518d4779fe': { name: 'Tempo MPP gateway', note: 'Anthropic, OpenAI, OpenRouter, fal.ai, Firecrawl, Modal and more' },
  '0x060b0fb0be9d90557577b3aee480711067149ff0': { name: 'Locus gateway', note: 'DeepL, DeepSeek, Groq, Hunter, RentCast and more' },
  '0xb25d77c967d412bbc10891c5254f4e56bb056f3d': { name: 'Dune' },
  '0xb98ef29eb2be19ae646a8fc0248255b90a332dbc': { name: 'Exa' },
  '0x7f51327a5a0927815dcca531aa97ec7252354091': { name: 'Alchemy' },
  '0xc5aa944050181da01a02da58db30d2cfc02f94d5': { name: 'Browserbase' },
  '0x523644802260a2850dfa5d731fe421895a118f1a': { name: 'Allium' },
  '0xf023e55b30a0340641e6eb7d33540584e203ee5f': { name: 'Parallel' },
  '0x6e3184c204e596ded89e8a5693b602097f4ab687': { name: 'AgentMail' },
  '0x1a749f06cf107f7e9e87f5ce1b9bdcb1cb0ca6e5': { name: 'Pinata IPFS' },
  '0xdc5b8d3d2037fbe7621b53e5a5983a547ef5dfde': { name: 'Tako' },
  '0x17ae28d21f80a1082ee3c54acb03769b09d42da8': { name: 'Doma' },
  '0xdb5aa553feeb2c3e3d03e8360b36fb0f7e480671': { name: 'StableEmail' },
  '0xdd257723b86b4947483905cdacbbbc70facf2ec0': { name: 'StableTravel' },
  '0xd219db8179bb9c1899ef87f39eeba9d1070c6801': { name: 'StablePhone' },
  '0xcfa26f13c6c18307033ece13bbb8f470da5b4dbe': { name: 'StableSocial' },
  '0x07f067959297767c887dbfa3c72379c66e82a045': { name: 'StableStudio' },
  '0x06dff3c8380b5d1799874ada903fc3422882fd6f': { name: 'StableUpload' },
  '0x19a09691d0a9c4fb80cc40694704a15858c6a454': { name: 'People Data Labs' },
  '0x12e8de0712aebe6579a9e16dee2ae9ffcc4e7dc2': { name: 'Coresignal' },
  '0x68e8bcc127cd079a79a48e9b7fa3934de40a2443': { name: 'Crustdata' },
  '0xca37de138574432b96f92b0cd9826dadfd1cf443': { name: 'PredictLeads' },
}

export const serviceAt = (address: string): Service | undefined => SERVICES[address.toLowerCase()]
