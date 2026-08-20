import { Router } from "express";
import { OperatorAuthorizationInput, OperatorAuthorization } from "@workspace/api-zod";
import { timingSafeEqual } from "node:crypto";

const router = Router();

function matchesSecret(password: string, expected: string): boolean {
  const provided = Buffer.from(password);
  const configured = Buffer.from(expected);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

router.post("/operator/authorize", (req, res): void => {
  const parsed = OperatorAuthorizationInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A protected role and password are required." });
    return;
  }

  const expectedPassword = process.env.ROVER_OPERATOR_PASSWORD;
  if (!expectedPassword) {
    req.log.error("ROVER_OPERATOR_PASSWORD is not configured");
    res.status(503).json({ error: "Operator authorization is not configured." });
    return;
  }

  if (!matchesSecret(parsed.data.password, expectedPassword)) {
    req.log.warn({ role: parsed.data.role }, "Rejected operator mode authorization");
    res.status(401).json({ error: "Invalid operator password." });
    return;
  }

  res.json(OperatorAuthorization.parse({ authorized: true }));
});

export default router;