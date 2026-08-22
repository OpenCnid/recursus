/** Stable assembly failure without command output, credentials, or machine paths. */
export class AssemblyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AssemblyError'
  }
}
