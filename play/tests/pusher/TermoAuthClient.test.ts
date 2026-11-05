// @vitest-environment node
import { exportJWK, generateKeyPair, SignJWT, decodeJwt } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateKeyPairResult, JWK } from "jose";

vi.mock("../../src/pusher/enums/EnvironmentVariable", async () => {
    const actual = await import("./mocks/pusherEnvironmentVariableMock");
    return {
        ...actual,
        TERMOAUTH_URL: "https://auth.termotubos.com.br",
        TERMOAUTH_API_URL: "https://api-auth.termotubos.com.br",
        TERMOAUTH_APP_ID: "workadventure",
        TERMOAUTH_ENABLED: true,
    };
});

const {
    createWorkAdventureSession,
    handoffRedirectForHost,
    resetTermoAuthJwksForTests,
    signOutRedirectForHost,
    TermoAuthError,
    verifyTermoAuthToken,
} = await import("../../src/pusher/services/TermoAuthClient");
const { termoAuthFrontUrlForHost, tokenFromHash } = await import("../../src/common/TermoAuthUrls");

const ISSUER = "https://auth.termotubos.com.br";
const PAGE_HOST = "workadventure.termotubos.com.br";

let keys: GenerateKeyPairResult;
let publicJwk: JWK;

beforeAll(async () => {
    keys = await generateKeyPair("EdDSA", { crv: "Ed25519" });
    publicJwk = await exportJWK(keys.publicKey);
    publicJwk.kid = "test-key";
    publicJwk.alg = "EdDSA";
    publicJwk.use = "sig";
});

beforeEach(() => {
    resetTermoAuthJwksForTests();
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://api-auth.termotubos.com.br/.well-known/jwks.json") {
            return Promise.resolve(
                new Response(JSON.stringify({ keys: [publicJwk] }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        }
        return Promise.resolve(new Response("missing", { status: 404 }));
    });
});

async function signToken(
    claims: { email: string; name?: string; isMaster?: boolean },
    options?: { issuer?: string; expiration?: string | number; alg?: "EdDSA" | "HS256" },
): Promise<string> {
    const header =
        options?.alg === "EdDSA" || options?.alg === undefined
            ? { alg: "EdDSA" as const, kid: "test-key" }
            : { alg: "HS256" as const };
    return new SignJWT({ email: claims.email, name: claims.name, isMaster: claims.isMaster })
        .setProtectedHeader(header)
        .setIssuer(options?.issuer ?? ISSUER)
        .setAudience(options?.issuer ?? ISSUER)
        .setSubject("11111111-1111-1111-1111-111111111111")
        .setExpirationTime(options?.expiration ?? "1h")
        .sign(options?.alg === "HS256" ? new TextEncoder().encode("not-the-eddsa-key") : keys.privateKey);
}

describe("TermoAuth JWT", () => {
    it("gives the admin tag only to a company master", async () => {
        const token = await signToken({
            email: "Master@termotubos.com.br",
            name: "Master",
            isMaster: true,
        });

        const identity = await verifyTermoAuthToken(token, PAGE_HOST);

        expect(identity.email).toBe("master@termotubos.com.br");
        expect(identity.name).toBe("Master");
        expect(identity.tags).toEqual(["admin"]);

        const session = await createWorkAdventureSession(token, PAGE_HOST);
        expect(decodeJwt(session).tags).toEqual(["admin"]);
        expect(decodeJwt(session).exp).toBe(identity.exp);
    });

    it("lets another company account in without the admin tag", async () => {
        const token = await signToken({
            email: "ana@termotubos.com.br",
            name: "Ana",
            isMaster: false,
        });

        const identity = await verifyTermoAuthToken(token, PAGE_HOST);

        expect(identity.tags).toEqual([]);
    });

    it("refuses an address outside the company", async () => {
        const token = await signToken({ email: "ana@example.com", isMaster: true });

        await expect(verifyTermoAuthToken(token, PAGE_HOST)).rejects.toMatchObject({ status: 403 });
    });

    it("refuses a lookalike domain and a token that is not EdDSA", async () => {
        const lookalike = await signToken({ email: "ana@nottermotubos.com.br", isMaster: true });
        await expect(verifyTermoAuthToken(lookalike, PAGE_HOST)).rejects.toBeInstanceOf(TermoAuthError);

        const wrongAlgorithm = await signToken({ email: "ana@termotubos.com.br" }, { alg: "HS256" });
        await expect(verifyTermoAuthToken(wrongAlgorithm, PAGE_HOST)).rejects.toMatchObject({ status: 401 });

        const wrongIssuer = await signToken({ email: "ana@termotubos.com.br" }, { issuer: "https://evil.example" });
        await expect(verifyTermoAuthToken(wrongIssuer, PAGE_HOST)).rejects.toMatchObject({ status: 401 });

        const expired = await signToken({ email: "ana@termotubos.com.br" }, { expiration: "-1s" });
        await expect(verifyTermoAuthToken(expired, PAGE_HOST)).rejects.toMatchObject({ status: 401 });
    });

    it("builds the handoff and sign-out links, and ignores a localhost URL away from localhost", () => {
        expect(handoffRedirectForHost(PAGE_HOST)).toBe("https://auth.termotubos.com.br/handoff?app=workadventure");
        expect(signOutRedirectForHost(PAGE_HOST)).toBe("https://auth.termotubos.com.br/sign-out?app=workadventure");
        expect(termoAuthFrontUrlForHost(PAGE_HOST, "http://localhost:51000")).toBe("https://auth.termotubos.com.br");
        expect(termoAuthFrontUrlForHost("localhost", "http://localhost:51000")).toBe("http://localhost:51000");
        expect(termoAuthFrontUrlForHost("sandbox-workadventure.termotubos.com.br", "")).toBe(
            "https://sandbox-auth.termotubos.com.br",
        );
        expect(tokenFromHash("#token=abc.def.ghi")).toBe("abc.def.ghi");
        expect(tokenFromHash("#chatRoomId=1")).toBeNull();
    });
});
