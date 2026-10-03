import { createHash, randomUUID } from "node:crypto";
import express, {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  GetCampaignStatusParams,
  GetCampaignStatusResponse,
  GetGmailProfileResponse,
  SendCampaignBody,
  SendCampaignResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
type CampaignStatus = ReturnType<typeof SendCampaignResponse.parse>;
type RecipientStatus = CampaignStatus["results"][number];
type CampaignInput = ReturnType<typeof SendCampaignBody.parse>;
type ResumeAttachment = NonNullable<CampaignInput["attachment"]>;
type ResumeContentType = ResumeAttachment["contentType"];

type CampaignEntry = {
  inputHash: string;
  status: CampaignStatus;
  createdAt: number;
};

const campaigns = new Map<string, CampaignEntry>();
const MAX_CAMPAIGN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CAMPAIGNS = 500;
const SEND_INTERVAL_MS = 1_200;
const SUPPORTED_MERGE_FIELDS = new Set(["name", "company", "role"]);
const EMAIL_PATTERN = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_MIME_BY_EXTENSION: Record<string, ResumeContentType> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const campaignJsonParser = express.json({ limit: "9mb" });

class GmailApiError extends Error {
  constructor(readonly status: number) {
    super(`Gmail API returned ${status}`);
  }
}

function pruneCampaigns(): void {
  const cutoff = Date.now() - MAX_CAMPAIGN_AGE_MS;
  for (const [campaignId, campaign] of campaigns) {
    if (campaign.createdAt < cutoff) campaigns.delete(campaignId);
  }

  while (campaigns.size >= MAX_CAMPAIGNS) {
    const oldestCompleted = [...campaigns.entries()].find(
      ([, campaign]) => campaign.status.state === "completed",
    )?.[0];
    if (oldestCompleted === undefined) return;
    campaigns.delete(oldestCompleted);
  }
}

async function getConnectedGmailProfile(): Promise<
  ReturnType<typeof GetGmailProfileResponse.parse>
> {
  const response = await new ReplitConnectors().proxy(
    "google-mail",
    "/gmail/v1/users/me/profile",
  );
  if (!response.ok) throw new GmailApiError(response.status);

  const parsed = GetGmailProfileResponse.safeParse(await response.json());
  if (!parsed.success) throw new Error("Gmail returned an invalid profile");
  return parsed.data;
}

type AccessResult =
  | { ok: true; profile: ReturnType<typeof GetGmailProfileResponse.parse> }
  | { ok: false; status: 401 | 403 | 502; error: string };

async function verifyGmailOwner(req: Request): Promise<AccessResult> {
  const { userId } = getAuth(req);
  if (!userId) {
    return { ok: false, status: 401, error: "Sign in to continue." };
  }

  try {
    const [user, profile] = await Promise.all([
      clerkClient.users.getUser(userId),
      getConnectedGmailProfile(),
    ]);
    const primaryEmail = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    );

    if (
      !primaryEmail ||
      primaryEmail.verification?.status !== "verified" ||
      primaryEmail.emailAddress.trim().toLowerCase() !==
        profile.emailAddress.trim().toLowerCase()
    ) {
      return {
        ok: false,
        status: 403,
        error: "Sign in with the verified email address for the connected Gmail account.",
      };
    }

    return { ok: true, profile };
  } catch (error) {
    const status = error instanceof GmailApiError ? error.status : undefined;
    req.log.error({ gmailStatus: status }, "Could not verify Gmail campaign access");
    return {
      ok: false,
      status: 502,
      error: "Could not verify the connected Gmail account. Try again shortly.",
    };
  }
}

async function requireGmailCampaignOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const access = await verifyGmailOwner(req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  next();
}

function parseCampaignJson(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  campaignJsonParser(req, res, (error?: Error): void => {
    if (!error) {
      next();
      return;
    }

    const status =
      "status" in error && typeof error.status === "number"
        ? error.status
        : 400;
    res.status(status === 413 ? 413 : 400).json({
      error:
        status === 413
          ? "Campaign request is too large. Resume files must be 5 MB or smaller."
          : "Campaign request must contain valid JSON.",
    });
  });
}

function validateResumeAttachment(
  attachment: ResumeAttachment | undefined,
): { attachment?: ResumeAttachment; error?: string } {
  if (!attachment) return {};

  const filename = attachment.filename.trim();
  if (
    !filename ||
    /[\\/\u0000-\u001f\u007f]/.test(filename) ||
    filename.length > 120
  ) {
    return { error: "Choose a resume with a valid filename." };
  }

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const expectedContentType = RESUME_MIME_BY_EXTENSION[extension];
  if (!expectedContentType || attachment.contentType !== expectedContentType) {
    return { error: "Resume attachments must be PDF, DOC, or DOCX files." };
  }

  const bytes = Buffer.from(attachment.contentBase64, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_RESUME_BYTES ||
    bytes.toString("base64") !== attachment.contentBase64
  ) {
    return { error: "The resume is empty, too large, or invalid." };
  }

  const hasExpectedSignature =
    expectedContentType === "application/pdf"
      ? bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))
      : expectedContentType === "application/msword"
        ? bytes.subarray(0, 8).equals(
            Buffer.from("D0CF11E0A1B11AE1", "hex"),
          )
        : bytes.subarray(0, 4).equals(Buffer.from("504b0304", "hex"));
  if (!hasExpectedSignature) {
    return { error: "The selected file does not match its resume file type." };
  }

  return {
    attachment: {
      ...attachment,
      filename: filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120),
      contentBase64: bytes.toString("base64"),
    },
  };
}

function renderTemplate(
  template: string,
  recipient: { name: string; company: string; role: string },
): string {
  return template.replace(
    /\{\{\s*([a-z]+)\s*\}\}/gi,
    (_match, field: string) => recipient[field.toLowerCase() as keyof typeof recipient],
  );
}

function hasUnsupportedMergeField(template: string): boolean {
  const matches = template.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g);
  for (const match of matches) {
    if (!SUPPORTED_MERGE_FIELDS.has(match[1].trim().toLowerCase())) return true;
  }
  return false;
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function buildRawMessage(
  email: string,
  subject: string,
  body: string,
  attachment?: ResumeAttachment,
): string {
  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
  const encodedBody = wrapBase64(Buffer.from(body, "utf8").toString("base64"));
  const headers = [
    `To: ${email}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
  ];
  let message: string;

  if (!attachment) {
    message = [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodedBody,
    ].join("\r\n");
  } else {
    const boundary = `letterwell_${randomUUID()}`;
    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodedBody,
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(attachment.contentBase64),
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

  return Buffer.from(message, "utf8").toString("base64url");
}

function safeSendError(status?: number): string {
  if (status === 429) {
    return "Gmail is temporarily rate-limiting sends. Check Sent before trying again.";
  }
  if (status === 401 || status === 403) {
    return "Gmail did not authorize this send. Check the connected account and its permissions.";
  }
  if (status) {
    return `Gmail could not send this message (HTTP ${status}). Check Sent before trying again.`;
  }
  return "Gmail did not confirm this send. Check Sent before trying again.";
}

async function sendOne(
  recipient: RecipientStatus,
  raw: string,
): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await new ReplitConnectors().proxy(
      "google-mail",
      "/gmail/v1/users/me/messages/send",
      { method: "POST", body: { raw } },
    );

    // A 429 is a definite rejection, so retry that rate-limit response with
    // backoff. Do not retry network errors or other 5xx responses: a lost
    // response from this non-idempotent API might mean the message was sent.
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new GmailApiError(response.status);
    const result = (await response.json()) as { id?: unknown };
    if (typeof result.id !== "string" || result.id.length === 0) {
      throw new Error("Gmail returned no message ID");
    }
    return result.id;
  }

  throw new GmailApiError(429);
}

function getCampaignStatus(entry: CampaignEntry): CampaignStatus {
  return SendCampaignResponse.parse(entry.status);
}

async function runCampaign(
  entry: CampaignEntry,
  prepared: Array<{
    result: RecipientStatus;
    subject: string;
    body: string;
  }>,
  req: Request,
  attachment?: ResumeAttachment,
): Promise<void> {
  for (let index = 0; index < prepared.length; index += 1) {
    const current = prepared[index];
    if (!current) continue;

    current.result.status = "sending";
    current.result.error = null;

    try {
      const raw = buildRawMessage(
        current.result.email,
        current.subject,
        current.body,
        attachment,
      );
      current.result.messageId = await sendOne(current.result, raw);
      current.result.status = "sent";
      entry.status.sentCount += 1;
    } catch (error) {
      const status = error instanceof GmailApiError ? error.status : undefined;
      current.result.status = "failed";
      current.result.error = safeSendError(status);
      entry.status.failedCount += 1;
      req.log.warn({ gmailStatus: status }, "Campaign recipient send failed");
    }

    if (index < prepared.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS));
    }
  }

  entry.status.state = "completed";
  req.log.info(
    {
      campaignId: entry.status.campaignId,
      sentCount: entry.status.sentCount,
      failedCount: entry.status.failedCount,
    },
    "Gmail campaign finished",
  );
}

router.get("/gmail/profile", async (req, res): Promise<void> => {
  const access = await verifyGmailOwner(req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  res.json(GetGmailProfileResponse.parse(access.profile));
});

router.post(
  "/campaigns/send",
  requireGmailCampaignOwner,
  parseCampaignJson,
  async (req, res): Promise<void> => {
  const parsed = SendCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the campaign fields and recipient list." });
    return;
  }

  const input = parsed.data;
  const validatedAttachment = validateResumeAttachment(input.attachment);
  if (validatedAttachment.error) {
    res.status(400).json({ error: validatedAttachment.error });
    return;
  }
  const attachment = validatedAttachment.attachment;
  const campaignId = input.campaignId.trim();
  if (
    !campaignId ||
    campaignId.length > 100 ||
    input.confirmed !== true ||
    input.subject.includes("\r") ||
    input.subject.includes("\n") ||
    hasUnsupportedMergeField(input.subject) ||
    hasUnsupportedMergeField(input.body)
  ) {
    res.status(400).json({ error: "Check the campaign fields and confirm the send." });
    return;
  }

  const seenEmails = new Set<string>();
  const prepared: Array<{
    result: RecipientStatus;
    subject: string;
    body: string;
  }> = [];

  for (const recipient of input.recipients) {
    const email = recipient.email.trim();
    const name = recipient.name.trim();
    const company = recipient.company.trim();
    const role = recipient.role.trim();
    const fields = [name, company, role];
    const emailKey = email.toLowerCase();

    if (
      !EMAIL_PATTERN.test(email) ||
      !name ||
      !company ||
      !role ||
      fields.some((field) => /[\u0000-\u001f\u007f]/.test(field)) ||
      seenEmails.has(emailKey)
    ) {
      res.status(400).json({
        error: "Every contact needs a unique valid email, name, company, and role.",
      });
      return;
    }
    seenEmails.add(emailKey);

    const mergedSubject = renderTemplate(input.subject, { name, company, role });
    const mergedBody = renderTemplate(input.body, { name, company, role });
    if (
      mergedSubject.length > 200 ||
      mergedSubject.includes("\r") ||
      mergedSubject.includes("\n") ||
      mergedBody.length > 10000 ||
      !mergedBody.trim()
    ) {
      res.status(400).json({
        error: `The personalized message for ${email} is invalid or too long.`,
      });
      return;
    }

    const result: RecipientStatus = {
      email,
      name,
      status: "queued",
      messageId: null,
      error: null,
    };
    prepared.push({
      result,
      subject: mergedSubject,
      body: mergedBody,
    });
  }

  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        recipients: input.recipients,
        subject: input.subject,
        body: input.body,
        attachment: attachment ?? null,
      }),
    )
    .digest("hex");
  const previous = campaigns.get(campaignId);
  if (previous) {
    if (previous.inputHash !== inputHash) {
      res.status(409).json({
        error: "This campaign ID was already used for different content.",
      });
      return;
    }
    res.status(202).json(getCampaignStatus(previous));
    return;
  }

  pruneCampaigns();
  const status = SendCampaignResponse.parse({
    campaignId,
    state: "sending",
    totalCount: prepared.length,
    sentCount: 0,
    failedCount: 0,
    results: prepared.map(({ result }) => result),
  });
  const entry: CampaignEntry = { inputHash, status, createdAt: Date.now() };
  campaigns.set(campaignId, entry);

  req.log.info(
    { campaignId, recipientCount: prepared.length },
    "Accepted confirmed Gmail campaign",
  );
  void runCampaign(entry, prepared, req, attachment).catch(() => {
    req.log.error({ campaignId }, "Gmail campaign worker stopped unexpectedly");
    entry.status.state = "completed";
    for (const recipient of entry.status.results) {
      if (recipient.status === "queued" || recipient.status === "sending") {
        recipient.status = "failed";
        recipient.error = "Campaign stopped unexpectedly. Check Sent before retrying.";
        entry.status.failedCount += 1;
      }
    }
  });

  res.status(202).json(getCampaignStatus(entry));
  },
);

router.get("/campaigns/:campaignId", async (req, res): Promise<void> => {
  const access = await verifyGmailOwner(req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const params = GetCampaignStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid campaign ID." });
    return;
  }

  const campaign = campaigns.get(params.data.campaignId);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }

  res.json(GetCampaignStatusResponse.parse(getCampaignStatus(campaign)));
});

export default router;