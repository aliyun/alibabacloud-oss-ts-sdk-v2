/** The keys a request is signed with. */
export interface Credentials {
  /** The access key id. */
  accessKeyId: string
  /** The access key secret. */
  accessKeySecret: string
  /** The STS security token, for temporary credentials. */
  securityToken?: string
  /** When the credentials expire, if they do. */
  expiration?: Date
}

/** Where the client gets its credentials. */
export interface CredentialsProvider {
  /** The result must be treated as read-only. */
  getCredentials(): Promise<Credentials>
}

/** Whether both keys are non-empty. */
export function hasKeys(credentials: Credentials): boolean {
  return credentials.accessKeyId.length > 0 && credentials.accessKeySecret.length > 0
}
