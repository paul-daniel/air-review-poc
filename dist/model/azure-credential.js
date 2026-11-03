/** Scope of every Microsoft Foundry data-plane call (models, Claude, agents). */
export const FOUNDRY_SCOPE = "https://ai.azure.com/.default";
/**
 * Which credential a Foundry call uses, in Microsoft's recommended order of
 * preference reversed for convenience:
 *
 *   1. an explicit API key (config or AIR_REVIEW_API_KEY / AZURE_AI_API_KEY);
 *   2. an explicit access token (AIR_REVIEW_ACCESS_TOKEN) for jobs that fetch
 *      one themselves;
 *   3. otherwise keyless: `DefaultAzureCredential` finds the identity of the
 *      environment (az login on a laptop, managed identity or the pipeline's
 *      service connection in CI) and refreshes tokens on its own.
 */
export async function resolveAzureCredential(input) {
    if (input.apiKey && input.auth !== "bearer") {
        return {
            kind: "api-key",
            apiKey: input.apiKey,
            description: input.apiKeyEnv ? `API key from ${input.apiKeyEnv}` : "API key from the config file",
        };
    }
    if (input.apiKey) {
        const token = input.apiKey;
        const credential = {
            getToken: async () => ({ token, expiresOnTimestamp: Date.now() + 50 * 60 * 1000 }),
        };
        return {
            kind: "access-token",
            tokenProvider: async () => token,
            credential,
            description: `access token from ${input.apiKeyEnv ?? "the config file"} (Authorization: Bearer)`,
        };
    }
    const { DefaultAzureCredential, getBearerTokenProvider } = await import("@azure/identity");
    const credential = new DefaultAzureCredential();
    return {
        kind: "entra-id",
        credential,
        tokenProvider: getBearerTokenProvider(credential, FOUNDRY_SCOPE),
        description: `Microsoft Entra ID via DefaultAzureCredential (az login, managed identity or service connection), scope ${FOUNDRY_SCOPE}`,
    };
}
//# sourceMappingURL=azure-credential.js.map