import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { z } from "zod";
import {
    isCompanyEmail,
    termoAuthApiUrlForHost,
    termoAuthFrontUrlForHost,
    termoAuthHandoffUrl,
    termoAuthSignOutUrl,
} from "../../common/TermoAuthUrls";
import { TERMOAUTH_API_URL, TERMOAUTH_APP_ID, TERMOAUTH_ENABLED, TERMOAUTH_URL } from "../enums/EnvironmentVariable";
import { jwtTokenManager } from "./JWTTokenManager";

const claimsSchema = z.object({
    sub: z.string().min(1),
    exp: z.number(),
    email: z.string().min(1),
    name: z.string().optional(),
    isMaster: z.boolean().optional(),
});

export class TermoAuthError extends Error {
    constructor(
        message: string,
        readonly status: 401 | 403 | 503,
    ) {
        super(message);
        this.name = "TermoAuthError";
    }
}

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function isTermoAuthEnabled(): boolean {
    return TERMOAUTH_ENABLED;
}

export function handoffRedirectForHost(pageHost: string): string {
    return termoAuthHandoffUrl(termoAuthFrontUrlForHost(pageHost, TERMOAUTH_URL), TERMOAUTH_APP_ID);
}

export function signOutRedirectForHost(pageHost: string): string {
    return termoAuthSignOutUrl(termoAuthFrontUrlForHost(pageHost, TERMOAUTH_URL), TERMOAUTH_APP_ID);
}

function jwksFor(apiUrl: string): ReturnType<typeof createRemoteJWKSet> {
    const existing = jwksByUrl.get(apiUrl);
    if (existing) {
        return existing;
    }
    const created = createRemoteJWKSet(new URL(`${apiUrl}/.well-known/jwks.json`), {
        cooldownDuration: 30_000,
        cacheMaxAge: 300_000,
    });
    jwksByUrl.set(apiUrl, created);
    return created;
}

export function resetTermoAuthJwksForTests(): void {
    jwksByUrl.clear();
}

export interface TermoAuthIdentity {
    email: string;
    name: string;
    isMaster: boolean;
    exp: number;
    tags: string[];
}

function unavailable(error: unknown): boolean {
    return error instanceof errors.JWKSTimeout || error instanceof TypeError;
}

export async function verifyTermoAuthToken(token: string, pageHost: string): Promise<TermoAuthIdentity> {
    const frontUrl = termoAuthFrontUrlForHost(pageHost, TERMOAUTH_URL);
    const apiUrl = termoAuthApiUrlForHost(pageHost, TERMOAUTH_API_URL);
    let payload: unknown;
    try {
        payload = (
            await jwtVerify(token, jwksFor(apiUrl), {
                issuer: frontUrl,
                audience: frontUrl,
                algorithms: ["EdDSA"],
            })
        ).payload;
    } catch (error) {
        if (unavailable(error)) {
            throw new TermoAuthError("TermoAuth is unavailable", 503);
        }
        throw new TermoAuthError("Invalid token", 401);
    }

    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) {
        throw new TermoAuthError("Invalid token", 401);
    }

    const email = claims.data.email.trim().toLowerCase();
    if (!isCompanyEmail(email)) {
        throw new TermoAuthError("This account cannot enter WorkAdventure", 403);
    }

    const isMaster = claims.data.isMaster === true;
    return {
        email,
        name: claims.data.name?.trim() || email,
        isMaster,
        exp: claims.data.exp,
        tags: isMaster ? ["admin"] : [],
    };
}

export async function createWorkAdventureSession(token: string, pageHost: string): Promise<string> {
    const identity = await verifyTermoAuthToken(token, pageHost);
    return jwtTokenManager.createAuthToken(
        identity.email,
        undefined,
        identity.name,
        undefined,
        identity.tags,
        identity.email.replace("@", "_"),
        undefined,
        identity.exp,
    );
}
