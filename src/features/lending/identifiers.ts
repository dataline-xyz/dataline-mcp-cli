const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const MORPHO_MARKET_ID_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const AAVE_COMPOSITE_MARKET_ID_PATTERN = /^0x[a-fA-F0-9]{40}:0x[a-fA-F0-9]{40}$/;

export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS_PATTERN.test(value);
}

export function isMorphoMarketId(value: string): boolean {
  return MORPHO_MARKET_ID_PATTERN.test(value);
}

export function isAaveMarketId(value: string): boolean {
  return isEvmAddress(value) || AAVE_COMPOSITE_MARKET_ID_PATTERN.test(value);
}
