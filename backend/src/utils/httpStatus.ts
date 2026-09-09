/**
 * Production-grade HTTP Status Code Constants
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];
export type HttpStatusKey = keyof typeof HttpStatus;

/**
 * Reverse mapping from numeric HTTP status code to string key name (e.g. 404 -> 'NOT_FOUND').
 */
export const HttpStatusNames = Object.fromEntries(
  Object.entries(HttpStatus).map(([key, value]) => [value, key as HttpStatusKey])
) as Record<number, HttpStatusKey>;

/**
 * @Description Returns the status key string corresponding to a numeric HTTP status code (e.g. 404 -> 'NOT_FOUND').
 * @Params statusCode (number) - Numeric HTTP status code
 *         fallback (string) - Fallback string if status code is unmapped (default: 'BAD_REQUEST')
 * @Returns string - String name representation of status code
 */
export function getHttpStatusName(
  statusCode: number,
  fallback: string = 'BAD_REQUEST'
): string {
  return HttpStatusNames[statusCode] || fallback;
}

