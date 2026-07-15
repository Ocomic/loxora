export function customerId(claims: Record<string, unknown>): string {
  if (typeof claims.customer_id !== "string") throw new Error("missing customer_id");
  return claims.customer_id;
}
