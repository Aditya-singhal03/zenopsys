import { Router } from "express";
import type { Db } from "../db/connection.js";
import { parseWorkflowDefinitionInput } from "./validation.js";
import { WorkflowDefinitionService } from "./service.js";

export function workflowDefinitionRoutes(db: Db): Router {
  const router = Router();
  const service = new WorkflowDefinitionService(db);

  router.post("/", (req, res) => {
    const input = parseWorkflowDefinitionInput(req.body);
    res.status(201).json(service.create(input));
  });

  router.get("/:definitionId", (req, res) => {
    res.json(service.get(req.params.definitionId));
  });

  router.put("/:definitionId", (req, res) => {
    const input = parseWorkflowDefinitionInput(req.body);
    res.json(service.update(req.params.definitionId, input));
  });

  return router;
}
