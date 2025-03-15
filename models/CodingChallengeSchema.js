const mongoose = require("mongoose");

const codingChallengeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    difficultyLevel: {
      type: String,
      required: true,
      enum: ["Easy", "Medium", "Hard"],
    },
    description: {
      type: String,
      required: true,
    },
    inputFormat: {
      type: String,
      required: true,
    },
    outputFormat: {
      type: String,
      required: true,
    },
    constraints: {
      type: String,
      required: true,
    },
    publicTestCases: [
      {
        input: String,
        output: String,
      },
    ],
    privateTestCases: [
      {
        input: String,
        output: String,
      },
    ],
    edgeCases: [
      {
        input: String,
        output: String,
      },
    ],
    explanation: {
      type: String,
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CodingChallenge", codingChallengeSchema);
