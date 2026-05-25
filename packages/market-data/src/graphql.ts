/**
 * @module graphql
 * Uniswap v3 subgraph queries.
 * Subgraph endpoint: https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3
 * Or via env: UNISWAP_SUBGRAPH_URL
 */

export interface SubgraphPool {
  id: string;
  token0: { id: string; symbol: string; decimals: string };
  token1: { id: string; symbol: string; decimals: string };
  feeTier: string;
  liquidity: string;
  sqrtPrice: string;
  tick: string;
  totalValueLockedUSD: string;
  volumeUSD: string;
  txCount: string;
  feesUSD: string;
  token0Price: string;
  token1Price: string;
}

const TOP_POOLS_QUERY = `
  query TopPools($minTvl: String!, $minVolume: String!, $skip: Int!) {
    pools(
      first: 100
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: {
        totalValueLockedUSD_gte: $minTvl
        volumeUSD_gte: $minVolume
        liquidity_gt: "0"
      }
    ) {
      id
      token0 { id symbol decimals }
      token1 { id symbol decimals }
      feeTier
      liquidity
      sqrtPrice
      tick
      totalValueLockedUSD
      volumeUSD
      txCount
      feesUSD
      token0Price
      token1Price
    }
  }
`;

const POOL_BY_ADDRESS_QUERY = `
  query PoolByAddress($address: String!) {
    pool(id: $address) {
      id
      token0 { id symbol decimals }
      token1 { id symbol decimals }
      feeTier
      liquidity
      sqrtPrice
      tick
      totalValueLockedUSD
      volumeUSD
      txCount
      feesUSD
      token0Price
      token1Price
    }
  }
`;

async function subgraphRequest<T>(
  subgraphUrl: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `[graphql] Subgraph HTTP error: ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

  if (json.errors?.length) {
    throw new Error(`[graphql] Subgraph errors: ${json.errors.map((e) => e.message).join(', ')}`);
  }

  if (!json.data) {
    throw new Error('[graphql] Subgraph returned no data');
  }

  return json.data;
}

/**
 * Fetch top pools from Uniswap v3 subgraph.
 * Paginates up to 500 pools to ensure broad universe coverage.
 */
export async function fetchTopPoolsFromSubgraph(
  subgraphUrl: string,
  minTvlUsd: number,
  minVolumeUsd: number,
): Promise<SubgraphPool[]> {
  const allPools: SubgraphPool[] = [];
  let skip = 0;
  const PAGE_SIZE = 100;
  const MAX_PAGES = 5;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await subgraphRequest<{ pools: SubgraphPool[] }>(
      subgraphUrl,
      TOP_POOLS_QUERY,
      {
        minTvl: String(minTvlUsd),
        minVolume: String(minVolumeUsd),
        skip,
      },
    );

    const pools = data.pools ?? [];
    allPools.push(...pools);

    if (pools.length < PAGE_SIZE) break; // last page
    skip += PAGE_SIZE;
  }

  return allPools;
}

/**
 * Fetch a single pool from subgraph by address.
 */
export async function fetchPoolFromSubgraph(
  subgraphUrl: string,
  poolAddress: string,
): Promise<SubgraphPool | null> {
  const data = await subgraphRequest<{ pool: SubgraphPool | null }>(
    subgraphUrl,
    POOL_BY_ADDRESS_QUERY,
    { address: poolAddress.toLowerCase() },
  );
  return data.pool;
}
