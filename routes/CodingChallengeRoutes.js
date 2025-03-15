const express = require("express");
const router = express.Router();
const {
  generateChallenge,
  getChallenges,
  getChallengeById,
} = require("../controllers/CodingChallengeController");

// Generate a new coding challenge
router.post("/generate", generateChallenge);

// Get all challenges
router.get("/", getChallenges);

// Get a challenge by ID
router.get("/:id", getChallengeById);

module.exports = router;
