import type { NextFunction, Request, Response } from "express";
import { AUTH_REQUIRED } from "./releaseConfig";
import { touchUser, verifyFirebaseToken } from "./firebaseAdmin";

export type RequestUser = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: RequestUser;
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearerToken(req);

  if (!token) {
    next();
    return;
  }

  try {
    req.user = await verifyFirebaseToken(token);
    await touchUser(req.user);
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readBearerToken(req);

  if (!token) {
    if (!AUTH_REQUIRED && process.env.NODE_ENV !== "production") {
      req.user = { uid: "local-dev-user", email: "local-dev-user@dev.local", name: "Local Dev" };
      await touchUser(req.user);
      next();
      return;
    }

    res.status(401).json({
      error: {
        code: "unauthenticated",
        message: "Masuk dulu untuk memakai fitur AI BokekLab.",
      },
    });
    return;
  }

  try {
    req.user = await verifyFirebaseToken(token);
    await touchUser(req.user);
    next();
  } catch {
    res.status(401).json({
      error: {
        code: "invalid_auth_token",
        message: "Sesi login tidak valid. Silakan masuk ulang.",
      },
    });
  }
}

function readBearerToken(req: Request) {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match?.[1];
}
