export interface Artifact {
  type: "branch" | "mr" | "document" | "issue" | "comment" | "commit"
  path?: string
  url?: string
  description: string
}
