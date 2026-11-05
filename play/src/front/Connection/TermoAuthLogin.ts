import { isAxiosError } from "axios";
import {
    termoAuthFrontUrlForHost,
    termoAuthHandoffUrl,
    termoAuthSignOutUrl,
    tokenFromHash,
} from "../../common/TermoAuthUrls";
import { ENABLE_TERMOAUTH, TERMOAUTH_APP_ID, TERMOAUTH_URL } from "../Enum/EnvironmentVariable";
import { axiosToPusher } from "./AxiosUtils";
import { localUserStore } from "./LocalUserStore";

export class TermoAuthExchangeError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "TermoAuthExchangeError";
    }
}

function appId(): string {
    return TERMOAUTH_APP_ID && TERMOAUTH_APP_ID.length > 0 ? TERMOAUTH_APP_ID : "workadventure";
}

export function termoAuthSignOutLocation(): string {
    return termoAuthSignOutUrl(termoAuthFrontUrlForHost(window.location.hostname, TERMOAUTH_URL), appId());
}

export async function acceptTermoAuthReturn(): Promise<string | null> {
    if (!ENABLE_TERMOAUTH) {
        return null;
    }
    const token = tokenFromHash(window.location.hash);
    if (!token) {
        return null;
    }

    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = "";
    window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}`);

    try {
        const response = await axiosToPusher.post<{ authToken?: string }>("termoauth-session", { token });
        const authToken = response.data.authToken;
        if (!authToken) {
            throw new TermoAuthExchangeError("TermoAuth login failed", 401);
        }
        localUserStore.setAuthToken(authToken);
        return authToken;
    } catch (error) {
        if (error instanceof TermoAuthExchangeError) {
            throw error;
        }
        if (isAxiosError(error) && error.response) {
            throw new TermoAuthExchangeError("TermoAuth login failed", error.response.status);
        }
        throw error;
    }
}

export function termoAuthHandoffLocation(): string {
    return termoAuthHandoffUrl(termoAuthFrontUrlForHost(window.location.hostname, TERMOAUTH_URL), appId());
}
