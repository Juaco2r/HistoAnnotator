import test from "node:test";
import assert from "node:assert/strict";

import {
  install,
  makeContext,
  plain,
} from "./frontend_contract_harness.mjs";

test("evaluation metadata separates analytical role from provenance", () => {
  const ctx = makeContext({
    PHASE_EVAL_ROLES: [
      ["annotation", "Regular annotation"],
      ["ground_truth", "Ground truth"],
      ["model_prediction", "Model prediction"],
      ["consensus", "Consensus"],
      ["reference", "Other reference"],
    ],
    PHASE_EVAL_SOURCES: [
      ["manual", "Manual / unspecified"],
      ["pathologist", "Pathologist"],
      ["model", "Model"],
      ["external", "External dataset/tool"],
      ["mixed", "Mixed / consensus"],
    ],
  });

  install(ctx, "phaseEvalNormalizeMetadata");

  assert.deepEqual(
    plain(
      ctx.phaseEvalNormalizeMetadata({
        role: "ground_truth",
        sourceType: "pathologist",
      })
    ),
    {
      schemaVersion: 1,
      role: "ground_truth",
      sourceType: "pathologist",
    }
  );

  assert.deepEqual(
    plain(
      ctx.phaseEvalNormalizeMetadata({
        role: "invalid",
        sourceType: "invalid",
      })
    ),
    {
      schemaVersion: 1,
      role: "annotation",
      sourceType: "manual",
    }
  );
});

test("evaluation mapping matches known target classes case-insensitively", () => {
  const ctx = makeContext();
  install(ctx, "phaseEvalSuggestedTarget");

  assert.equal(
    ctx.phaseEvalSuggestedTarget(
      "stroma",
      ["Tumor", "Stroma", "Vessels"]
    ),
    "Stroma"
  );

  assert.equal(
    ctx.phaseEvalSuggestedTarget(
      "Tumour",
      ["Tumor", "Stroma"]
    ),
    "Tumour"
  );
});
