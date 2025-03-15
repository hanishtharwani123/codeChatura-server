const express = require("express");
const router = express.Router();
const {
  generateMCQ,
  getMCQs,
  getMCQById,
} = require("../controllers/MCQChallengeController");

// Generate a new MCQ
router.post("/generate", generateMCQ);

// Get all MCQs
router.get("/", getMCQs);

// Get an MCQ by ID
router.get("/:id", getMCQById);

module.exports = router;
