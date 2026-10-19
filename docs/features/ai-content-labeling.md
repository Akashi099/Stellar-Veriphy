# AI-Generated Content Labeling

**Related issue:** #673
**Status:** Implemented

---

## Overview

StellarVeriphy supports attaching AI-generation labels to uploaded assets.
Labels allow downstream verification to differentiate natural and synthetic
content and meet emerging disclosure requirements (EU AI Act, US AI disclosure
frameworks, C2PA).

Labels are **non-destructive**: they annotate a provenance record without
blocking certification.  However, the compliance policy engine
(`docs/features/compliance-policy.md`) may restrict or block certain asset
classes if AI-generated content is detected.

---

## Label schema

A label captures:

| Field | Type | Description |
|---|---|---|
| `generationType` | `AiGenerationType` | Classification result (see below). |
| `confidence` | `number` [0, 1] | Confidence in the classification. |
| `detectionSource` | `DetectionSource` | How the label was produced. |
| `modelName` | `string` (optional) | Model or tool used for detection. |
| `modelVersion` | `string` (optional) | Version of the model. |
| `labeledAt` | ISO 8601 | When the label was assigned. |
| `note` | `string` (optional) | Free-text nuance note. |

### `AiGenerationType` values

| Value | Meaning |
|---|---|
| `fully_generated` | Entirely produced by an AI model. |
| `partially_generated` | Human-created base with AI-assisted edits. |
| `ai_enhanced` | Real content processed/upscaled by a model. |
| `human_created` | Confirmed not AI-generated. |
| `unknown` | Detection inconclusive or not attempted. |

### `DetectionSource` values

| Value | Trust level | Notes |
|---|---|---|
| `detector_heuristic` | Lowest | Automated heuristics; unreliable. |
| `detector_model` | Medium | Trained classifier. |
| `creator_declared` | Medium-high | Explicit creator attestation. |
| `platform_review` | High | Manual moderator decision. |
| `tee_verified` | Highest | Label produced inside TEE; attested. |

---

## Multiple labels and resolution

An asset may accumulate multiple labels over time (e.g. creator declared
`human_created`, later a platform reviewer sets `partially_generated`).

The **display label** is resolved by:
1. Highest-trust `detectionSource` wins.
2. Within the same trust tier, the most recent label wins.

---

## Confidence and uncertainty

The system never overstates certainty.  `describeLabel()` (in
`packages/shared/ai-labeling/index.ts`) produces human-readable descriptions
such as:

- `"Very likely AI-generated (95%)"` (confidence ≥ 0.9)
- `"Possibly partially AI-generated (55%) — classification uncertain, do not treat as definitive"` (confidence < 0.7)

Any label with `confidence < 0.7` must be presented with a disclaimer.

---

## API reference

### `POST /api/uploads/:id/ai-label`

Attach a label to an uploaded asset.

**Creator-declared label:**
```json
{
  "generationType": "fully_generated",
  "detectionSource": "creator_declared",
  "note": "This image was generated with Stable Diffusion XL."
}
```

**Detector-produced label:**
```json
{
  "generationType": "partially_generated",
  "detectionSource": "detector_model",
  "modelName": "C2PA-detector",
  "modelVersion": "2.1.0",
  "confidence": 0.82
}
```

**Responses:**

| Status | Meaning |
|---|---|
| 201 | Label stored; response body is the full `AiLabelRecord`. |
| 404 | No upload with this ID. |
| 422 | Validation error (unknown `generationType`, missing `modelName`, etc.). |

### `GET /api/uploads/:id/ai-label`

Return all labels and the resolved display label for an asset.

**Response:**
```json
{
  "status": "ok",
  "data": {
    "assetId": "upload-uuid",
    "labels": [ { ... } ],
    "displayLabel": { "generationType": "fully_generated", "confidence": 1.0, ... }
  }
}
```

---

## Code locations

| Module | Purpose |
|---|---|
| `packages/shared/ai-labeling/index.ts` | Types, helpers, `resolveDisplayLabel`, `describeLabel`. |
| `frontend/app/api/uploads/[id]/ai-label/route.ts` | REST endpoints. |
