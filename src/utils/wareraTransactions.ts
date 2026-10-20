/** Unwrap tRPC's current JSON transformer shape and the legacy direct shape. */
export function getTrpcData(payload: any): any {
  const data = payload?.result?.data;
  return data?.json ?? data;
}

export function getTransactionItems(payload: any): any[] | null {
  const data = getTrpcData(payload);
  return Array.isArray(data?.items) ? data.items : null;
}

export function getTransactionAmount(item: any): number {
  const amount = Number(item?.money ?? item?.amount ?? item?.value);
  return Number.isFinite(amount) ? amount : 0;
}
