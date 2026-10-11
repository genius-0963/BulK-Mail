import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(cookieParser());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// The Clerk proxy must run before body parsers so it can forward raw requests.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

const defaultJsonParser = express.json();
app.use((req, res, next) => {
  // The campaign route parses its larger, attachment-capable JSON body only
  // after checking the sender's identity.
  if (req.method === "POST" && req.path === "/api/campaigns/send") {
    next();
    return;
  }
  defaultJsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

if (process.env.CLERK_PUBLISHABLE_KEY) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  // Fallback no-op clerkMiddleware if keys are not yet configured during local bootstrapping
  app.use(clerkMiddleware());
}

app.use("/api", router);

export default app;
