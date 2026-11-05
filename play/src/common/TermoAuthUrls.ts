const TERMOAUTH_DEV_URL = "http://localhost:51000";
const TERMOAUTH_SANDBOX_URL = "https://sandbox-auth.termotubos.com.br";
const TERMOAUTH_PRODUCTION_URL = "https://auth.termotubos.com.br";

const TERMOAUTH_DEV_API_URL = "http://localhost:51001";
const TERMOAUTH_SANDBOX_API_URL = "https://sandbox-api-auth.termotubos.com.br";
const TERMOAUTH_PRODUCTION_API_URL = "https://api-auth.termotubos.com.br";

export const TERMOAUTH_COMPANY_DOMAIN = "termotubos.com.br";

export function isLocalHost(host: string): boolean {
    const name = host.trim().toLowerCase();
    return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name === "::1";
}

export function isLocalUrl(url: string): boolean {
    try {
        return isLocalHost(new URL(url).hostname);
    } catch {
        return false;
    }
}

function urlForHost(pageHost: string, localUrl: string, sandboxUrl: string, productionUrl: string): string {
    if (isLocalHost(pageHost)) {
        return localUrl;
    }
    if (pageHost.toLowerCase().startsWith("sandbox-")) {
        return sandboxUrl;
    }
    return productionUrl;
}

function configuredOrByHost(pageHost: string, configured: string | undefined, byHost: string): string {
    const value = (configured ?? "").trim().replace(/\/+$/, "");
    if (!value) {
        return byHost;
    }
    if (isLocalUrl(value) && !isLocalHost(pageHost)) {
        return byHost;
    }
    return value;
}

export function termoAuthFrontUrlForHost(pageHost: string, configured: string | undefined): string {
    return configuredOrByHost(
        pageHost,
        configured,
        urlForHost(pageHost, TERMOAUTH_DEV_URL, TERMOAUTH_SANDBOX_URL, TERMOAUTH_PRODUCTION_URL),
    );
}

export function termoAuthApiUrlForHost(pageHost: string, configured: string | undefined): string {
    return configuredOrByHost(
        pageHost,
        configured,
        urlForHost(pageHost, TERMOAUTH_DEV_API_URL, TERMOAUTH_SANDBOX_API_URL, TERMOAUTH_PRODUCTION_API_URL),
    );
}

export function termoAuthHandoffUrl(frontUrl: string, appId: string): string {
    return `${frontUrl}/handoff?app=${encodeURIComponent(appId)}`;
}

export function termoAuthSignOutUrl(frontUrl: string, appId: string): string {
    return `${frontUrl}/sign-out?app=${encodeURIComponent(appId)}`;
}

export function isCompanyEmail(email: string): boolean {
    const normalized = email.trim().toLowerCase();
    const at = normalized.lastIndexOf("@");
    return at > 0 && normalized.slice(at + 1) === TERMOAUTH_COMPANY_DOMAIN;
}

export function tokenFromHash(hash: string): string | null {
    if (!hash.startsWith("#")) {
        return null;
    }
    const token = new URLSearchParams(hash.slice(1)).get("token");
    if (!token) {
        return null;
    }
    return token;
}
