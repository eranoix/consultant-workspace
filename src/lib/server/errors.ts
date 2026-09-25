/** An error with an HTTP status. Lives apart from http.ts so the worker can use it without Next. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
