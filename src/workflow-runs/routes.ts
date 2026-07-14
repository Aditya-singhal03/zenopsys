import { Router } from "express";
import type { Db } from "../db/connection.js";
import { WorkflowRunService } from "./service.js";
import { parseSubmitRequest } from "./validation.js";

export function workflowRunRoutes(db: Db): Router {
  const router = Router();
  const service = new WorkflowRunService(db);

  router.post("/workflow-definitions/:definitionId/runs", (req, res) => {
    res.status(201).json(service.start(req.params.definitionId));
  });

  router.get("/runs/:runId", (req, res) => {
    res.json(service.get(req.params.runId));
  });

  router.post("/runs/:runId/submit", (req, res) => {
    const request = parseSubmitRequest(req.body);
    res.json(service.submit(req.params.runId, request.mode, request.data));
  });

  router.post("/runs/:runId/cancel", (req, res) => {
    res.json(service.cancel(req.params.runId));
  });

  return router;
}
