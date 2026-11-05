// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Application, Request, Response } from "express";

const { authorizationUrl } = vi.hoisted(() => ({
    authorizationUrl: vi.fn(),
}));

vi.mock("@workadventure/messages", () => ({
    MeResponse: {},
}));
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
vi.mock("../../src/pusher/services/AdminService", () => ({
    adminService: { getCapabilities: () => Promise.resolve({}) },
}));
vi.mock("../../src/pusher/services/verifyDomain/VerifyDomainService", () => ({
    VerifyDomainService: {
        get: () => ({
            verifyDomain: () => Promise.resolve(true),
        }),
    },
}));
vi.mock("../../src/pusher/services/OpenIDClient", () => ({
    openIDClient: { authorizationUrl },
}));

const { AuthenticateController } = await import("../../src/pusher/controllers/AuthenticateController");

function routesFor(method: "get" | "post"): Map<string, (req: Request, res: Response) => Promise<void>> {
    const routes = new Map<string, (req: Request, res: Response) => Promise<void>>();
    const app = {
        get: (path: string, handler: (req: Request, res: Response) => Promise<void>) => {
            if (method === "get") {
                routes.set(path, handler);
            }
        },
        post: (path: string, handler: (req: Request, res: Response) => Promise<void>) => {
            if (method === "post") {
                routes.set(path, handler);
            }
        },
        options: () => undefined,
    };
    new AuthenticateController(app as unknown as Application);
    return routes;
}

describe("TermoAuth login routes", () => {
    it("sends /login-screen to the TermoAuth handoff and does not start OpenID", async () => {
        const routes = routesFor("get");
        const redirect = vi.fn();
        await routes.get("/login-screen")?.(
            {
                method: "GET",
                originalUrl: "/login-screen",
                ip: "127.0.0.1",
                query: { playUri: "https://workadventure.termotubos.com.br/@/org/world" },
            } as unknown as Request,
            { redirect, status: vi.fn(), send: vi.fn(), cookie: vi.fn() } as unknown as Response,
        );

        expect(redirect).toHaveBeenCalledWith("https://auth.termotubos.com.br/handoff?app=workadventure");
        expect(authorizationUrl).not.toHaveBeenCalled();
    });

    it("sends /logout to TermoAuth sign-out", async () => {
        const routes = routesFor("get");
        const redirect = vi.fn();
        await routes.get("/logout")?.(
            {
                method: "GET",
                originalUrl: "/logout",
                ip: "127.0.0.1",
                query: {
                    playUri: "https://workadventure.termotubos.com.br/@/org/world",
                    token: "local-session",
                },
            } as unknown as Request,
            { redirect, status: vi.fn(), send: vi.fn(), cookie: vi.fn() } as unknown as Response,
        );

        expect(redirect).toHaveBeenCalledWith("https://auth.termotubos.com.br/sign-out?app=workadventure");
    });

    it("refuses anonymous login while TermoAuth is enabled", async () => {
        const routes = routesFor("post");
        const status = vi.fn().mockReturnThis();
        const send = vi.fn();
        await routes.get("/anonymLogin")?.(
            { method: "POST", originalUrl: "/anonymLogin", ip: "127.0.0.1" } as unknown as Request,
            { status, send } as unknown as Response,
        );

        expect(status).toHaveBeenCalledWith(403);
    });
});
