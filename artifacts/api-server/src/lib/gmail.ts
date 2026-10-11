import { google } from "googleapis";
import { clerkClient } from "@clerk/express";
import { logger } from "./logger";

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
}

export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    message: string = `Gmail API error with status ${status}`,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

/**
 * Resolves an authenticated Google OAuth2 client for a given user request.
 * Priority:
 * 1. User's Google OAuth access token retrieved from Clerk (if signed in via Google)
 * 2. Server-wide Google OAuth2 credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)
 * 3. Fallback direct Access Token (GOOGLE_ACCESS_TOKEN)
 */
async function getGoogleAuth(userId?: string) {
  // Option 1: Retrieve token from Clerk if user signed in with Google
  if (userId) {
    try {
      const tokens = await clerkClient.users.getUserOauthAccessToken(
        userId,
        "oauth_google",
      );
      if (tokens.data && tokens.data.length > 0 && tokens.data[0].token) {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: tokens.data[0].token });
        return auth;
      }
    } catch (err) {
      logger.debug({ err, userId }, "Could not fetch Clerk Google OAuth token, trying server credentials");
    }
  }

  // Option 2: Server environment credentials
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const accessToken = process.env.GOOGLE_ACCESS_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({
      refresh_token: refreshToken,
      access_token: accessToken,
    });
    return auth;
  }

  if (accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return auth;
  }

  // Option 3: Check for application default credentials
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    });
    return auth;
  } catch {
    throw new GmailApiError(
      401,
      "No Gmail credentials configured. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN or connect Google OAuth via Clerk.",
    );
  }
}

/**
 * Fetch the connected Gmail mailbox profile
 */
export async function getConnectedGmailProfile(userId?: string): Promise<GmailProfile> {
  try {
    const auth = await getGoogleAuth(userId);
    const gmail = google.gmail({ version: "v1", auth });

    const res = await gmail.users.getProfile({
      userId: "me",
    });

    const emailAddress = res.data.emailAddress;
    const messagesTotal = res.data.messagesTotal ?? 0;

    if (!emailAddress) {
      throw new GmailApiError(502, "Gmail profile returned no email address");
    }

    return {
      emailAddress,
      messagesTotal: Number(messagesTotal),
    };
  } catch (error: any) {
    const status = error.status || error.code || (error instanceof GmailApiError ? error.status : 502);
    logger.error({ error, status }, "Error fetching Gmail profile");
    throw new GmailApiError(
      typeof status === "number" ? status : 502,
      error.message || "Failed to fetch Gmail profile",
    );
  }
}

/**
 * Send a raw RFC 2822 email via Gmail API
 */
export async function sendGmailRawMessage(
  raw: string,
  userId?: string,
): Promise<string> {
  const auth = await getGoogleAuth(userId);
  const gmail = google.gmail({ version: "v1", auth });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
        },
      });

      const messageId = res.data.id;
      if (!messageId) {
        throw new Error("Gmail API returned no message ID");
      }

      return messageId;
    } catch (error: any) {
      const status = error.status || error.code;
      // Handle rate limits (429) with exponential backoff
      if (status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
        continue;
      }

      logger.warn({ error, status, attempt }, "Gmail send attempt failed");
      throw new GmailApiError(
        typeof status === "number" ? status : 500,
        error.message || "Gmail send failed",
      );
    }
  }

  throw new GmailApiError(429, "Gmail rate limit exceeded");
}
