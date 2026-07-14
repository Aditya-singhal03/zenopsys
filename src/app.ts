import express from "express";
import type { Db } from "./db/connection.js";
import { errorHandler } from "./shared/errors.js";
import { workflowDefinitionRoutes } from "./workflow-definitions/routes.js";
import { workflowRunRoutes } from "./workflow-runs/routes.js";

export function createApp(db: Db) {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/v1/workflow-definitions", workflowDefinitionRoutes(db));
  app.use("/api/v1", workflowRunRoutes(db));
  app.use(errorHandler);

  return app;
}
