/**
 * Type declarations for node-llama-cpp.
 * The actual module is installed as a native dependency and provides
 * pre-built llama.cpp binaries for the target platform.
 */
declare module 'node-llama-cpp' {
  export function getLlama(): Promise<any>

  export class LlamaChatSession {
    constructor(opts: {
      contextSequence: any
      systemPrompt?: string
    })
    prompt(message: string): Promise<string>
  }

  export class LlamaModel {
    createContext(opts?: { contextSize?: number }): Promise<LlamaContext>
  }

  export class LlamaContext {
    getSequence(): any
  }
}
