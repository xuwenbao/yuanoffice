export interface LanguagePort {
  get(): Promise<string>
  set(language: string): Promise<void>
  onChanged(handler: (language: string) => void): () => void
}
